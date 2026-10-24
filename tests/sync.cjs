'use strict';

var assert = require('node:assert/strict');
var ReviewSync = require('../docs/assets/review-sync.js');

var C = ReviewSync.constants;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function fromB64(text) {
  return Buffer.from(text, 'base64').toString('utf8');
}

function createStorage(initial) {
  var data = new Map(Object.entries(initial || {}));
  return {
    getItem: function (key) { return data.has(key) ? data.get(key) : null; },
    setItem: function (key, value) { data.set(key, String(value)); },
    removeItem: function (key) { data.delete(key); },
    _map: data
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: function () { return Promise.resolve(body); },
    text: function () {
      return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body));
    }
  };
}

function emptyState() {
  return { version: 1, favorites: {}, deleted: {} };
}

function createRepo(options) {
  options = options || {};
  var current = options.state === undefined ? null : clone(options.state);
  var sha = current ? 'sha-1' : null;
  var shaCounter = 1;
  var repo = {
    calls: [],
    repoStatus: null,
    apiReadStatus: null,
    rawStatus: null,
    putStatus: null,
    networkDown: false,
    rawDown: false,
    putDown: false,
    conflicts: 0,
    conflictAdditions: [],
    readGate: null,
    beforeRead: null,
    beforePut: null,
    token: options.token || 'good-token',
    putAttempts: 0,
    putCount: 0
  };

  Object.defineProperty(repo, 'state', {
    get: function () { return current === null ? null : clone(current); }
  });

  repo.setRemoteState = function (next) {
    current = next === null ? null : clone(next);
    sha = current ? 'sha-' + (++shaCounter) : null;
  };

  function applyConflictAddition(addition) {
    if (!current) current = emptyState();
    if (!current.favorites) current.favorites = {};
    if (!current.deleted) current.deleted = {};
    if (addition.kind === 'deleted') {
      current.deleted[addition.id] = {
        deleted: true,
        updated: '2026-04-01T00:00:00.000Z',
        title: addition.title || addition.id
      };
    } else {
      current.favorites[addition.id] = { updated: '2026-04-01T00:00:00.000Z' };
    }
  }

  async function fetcher(url, requestOptions) {
    requestOptions = requestOptions || {};
    var method = (requestOptions.method || 'GET').toUpperCase();
    var headers = requestOptions.headers || {};
    repo.calls.push({
      url: url,
      method: method,
      headers: headers,
      body: requestOptions.body
    });

    if (repo.networkDown) throw new Error('simulated network outage');

    if (url === C.API_REPO) {
      if (repo.repoStatus) return response(repo.repoStatus, { message: 'repo failure' });
      var auth = headers.Authorization || headers.authorization;
      if (auth !== 'Bearer ' + repo.token) {
        return response(401, { message: 'Bad credentials' });
      }
      return response(200, { full_name: C.REPO, permissions: { push: true } });
    }

    if (url.indexOf(C.API_CONTENT) === 0) {
      if (method === 'GET') {
        if (repo.beforeRead) {
          var hooked = await repo.beforeRead();
          if (hooked) return hooked;
        }
        if (repo.readGate) {
          var gate = repo.readGate;
          repo.readGate = null;
          await gate;
        }
        if (repo.apiReadStatus) {
          return response(repo.apiReadStatus, { message: 'read failure' });
        }
        if (!current) return response(404, { message: 'Not Found' });
        return response(200, {
          content: b64(JSON.stringify(current, null, 2) + '\n'),
          encoding: 'base64',
          sha: sha
        });
      }

      if (method === 'PUT') {
        repo.putAttempts += 1;
        if (repo.putDown) throw new Error('simulated write outage');
        if (repo.beforePut) {
          var putHook = await repo.beforePut();
          if (putHook) return putHook;
        }
        if (repo.putStatus) {
          return response(repo.putStatus, { message: 'write failure' });
        }
        var authHeader = headers.Authorization || headers.authorization;
        if (authHeader !== 'Bearer ' + repo.token) {
          return response(401, { message: 'Bad credentials' });
        }
        var body;
        try {
          body = JSON.parse(requestOptions.body);
        } catch (error) {
          return response(422, { message: 'invalid body' });
        }
        if (repo.conflicts > 0) {
          repo.conflicts -= 1;
          repo.conflictAdditions.forEach(applyConflictAddition);
          sha = 'sha-conflict-' + (++shaCounter);
          return response(409, { message: 'sha does not match' });
        }
        if ((body.sha || null) !== sha) {
          return response(409, { message: 'sha does not match' });
        }
        if (body.branch !== C.BRANCH) {
          return response(422, { message: 'wrong branch' });
        }
        current = JSON.parse(fromB64(body.content));
        sha = 'sha-' + (++shaCounter);
        repo.putCount += 1;
        return response(200, { content: { sha: sha }, commit: { sha: 'commit-' + sha } });
      }
    }

    if (url.indexOf(C.RAW_CONTENT) === 0) {
      if (repo.rawDown) throw new Error('simulated raw outage');
      if (repo.rawStatus) return response(repo.rawStatus, { message: 'raw failure' });
      if (!current) return response(404, 'Not Found');
      return response(200, JSON.stringify(current));
    }

    throw new Error('Unexpected mock URL: ' + url + ' (' + method + ')');
  }

  repo.fetcher = fetcher;
  return repo;
}

function createStore(repo, options) {
  options = options || {};
  return ReviewSync.createStore({
    fetcher: options.fetcher || repo.fetcher,
    storage: options.storage || createStorage(),
    knownIds: options.knownIds || function () { return ['game-a', 'game-b', 'game-c', 'game-z']; },
    now: options.now || function () { return '2026-03-04T05:06:07.000Z'; }
  });
}

function expectReject(promise, pattern) {
  return promise.then(function () {
    throw new Error('Expected promise to reject.');
  }, function (error) {
    assert.ok(error instanceof Error, 'Expected an Error instance.');
    if (pattern) {
      assert.match(error.message, pattern);
    }
    return error;
  });
}

function callsTo(repo, method) {
  return repo.calls.filter(function (call) { return call.method === method; });
}

async function testTokenPersistenceAndFallback() {
  var storage = createStorage({
    'discovery-watchlist-token-v1': 'legacy-secret'
  });
  var repo = createRepo();
  var store = createStore(repo, { storage: storage });

  // Legacy fallback is used only while no primary token exists.
  assert.equal(store.getToken(), 'legacy-secret');
  assert.equal(storage.getItem('discovery-watchlist-token-v1'), 'legacy-secret');

  store.setToken('  primary-secret  ');
  assert.equal(store.getToken(), 'primary-secret');
  assert.equal(storage.getItem(C.TOKEN_KEY), 'primary-secret');
  // The legacy discovery key is never modified.
  assert.equal(storage.getItem('discovery-watchlist-token-v1'), 'legacy-secret');

  store.clearToken();
  assert.equal(store.getToken(), '');
  assert.equal(storage.getItem(C.TOKEN_KEY), null);
  assert.equal(storage.getItem(C.LEGACY_TOKEN_KEY), 'legacy-secret');
  assert.equal(storage.getItem(C.FALLBACK_DISABLED_KEY), '1');

  // A fresh store on the same browser must not silently reuse the legacy token.
  var fresh = createStore(repo, { storage: storage });
  assert.equal(fresh.getToken(), '');

  // Saving a new token re-enables normal use.
  fresh.setToken('second-secret');
  assert.equal(fresh.getToken(), 'second-secret');
  assert.equal(storage.getItem(C.FALLBACK_DISABLED_KEY), null);
  assert.equal(storage.getItem(C.LEGACY_TOKEN_KEY), 'legacy-secret');

  assert.throws(function () { store.setToken('   '); }, /non-empty/);
  assert.throws(function () { store.setToken(null); }, /non-empty/);
}

async function testLoadAndCache() {
  var initialState = {
    version: 1,
    favorites: { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } },
    deleted: {
      'game-c': { deleted: true, updated: '2026-01-02T00:00:00.000Z', title: '찰리' }
    }
  };
  var repo = createRepo({ state: initialState });
  var storage = createStorage();
  var store = createStore(repo, { storage: storage });

  var result = await store.load();
  assert.deepEqual(result, { ready: true, cached: false });
  assert.equal(store.ready, true);
  assert.equal(store.busy, false);
  assert.deepEqual(store.data, initialState);
  assert.equal(store.data.deleted['game-c'].title, '찰리');

  var cached = JSON.parse(storage.getItem(C.CACHE_KEY));
  assert.deepEqual(cached, initialState);

  // Offline cache remains visible but must never enable writes.
  repo.networkDown = true;
  repo.rawDown = true;
  result = await store.load();
  assert.equal(result.ready, false);
  assert.equal(result.cached, true);
  assert.equal(store.ready, false);
  assert.match(result.error, /Could not reach GitHub|Could not load/);
  assert.deepEqual(store.data, initialState);

  // Completely offline with no cache: not ready.
  var offlineStore = createStore(repo, { storage: createStorage() });
  result = await offlineStore.load();
  assert.equal(result.ready, false);
  assert.equal(result.cached, false);
  assert.match(result.error, /Could not reach GitHub|Could not load/);

  // API failure, raw fallback works.
  var fallbackRepo = createRepo({ state: initialState });
  fallbackRepo.apiReadStatus = 500;
  var fallbackStore = createStore(fallbackRepo, { storage: createStorage() });
  result = await fallbackStore.load();
  assert.deepEqual(result, { ready: true, cached: false });
  assert.deepEqual(fallbackStore.data, initialState);
  assert.ok(fallbackRepo.calls.some(function (call) {
    return call.url.indexOf(C.RAW_CONTENT) === 0;
  }));

  // Missing branch/file is not synchronized or writable.
  var missingRepo = createRepo({ state: null });
  var missingStore = createStore(missingRepo, { storage: createStorage() });
  result = await missingStore.load();
  assert.equal(result.ready, false);
  assert.match(result.error, /404/);
  assert.deepEqual(missingStore.data, emptyState());
}

async function testVerifyToken() {
  var repo = createRepo();
  var store = createStore(repo, { storage: createStorage() });

  assert.equal(await store.verifyToken(), false);
  assert.equal(repo.calls.length, 0);

  store.setToken('good-token');
  assert.equal(await store.verifyToken(), true);

  store.setToken('bad-token');
  assert.equal(await store.verifyToken(), false);

  store.setToken('good-token');
  repo.repoStatus = 500;
  await expectReject(store.verifyToken(), /HTTP 500/);

  repo.repoStatus = null;
  repo.networkDown = true;
  await expectReject(store.verifyToken(), /reach GitHub/);
}

async function testChangeMergesAndPreservesUnrelated() {
  var initialState = {
    version: 1,
    favorites: { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } },
    deleted: {
      'game-c': { deleted: true, updated: '2026-01-02T00:00:00.000Z', title: 'Charlie' }
    }
  };
  var repo = createRepo({ state: initialState });
  var storage = createStorage();
  var store = createStore(repo, { storage: storage });
  store.setToken('good-token');
  await store.load();

  var next = await store.change({ kind: 'favorite', id: 'game-b', title: 'Bravo', value: true });
  assert.equal(next.favorites['game-b'].updated, '2026-03-04T05:06:07.000Z');
  assert.equal(next.favorites['game-a'].updated, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(next.deleted['game-c'], {
    deleted: true,
    updated: '2026-01-02T00:00:00.000Z',
    title: 'Charlie'
  });
  assert.deepEqual(repo.state, next);
  assert.deepEqual(store.data, next);

  var put = callsTo(repo, 'PUT').pop();
  var body = JSON.parse(put.body);
  assert.equal(body.branch, C.BRANCH);
  assert.equal(body.sha, 'sha-1');
  var sent = JSON.parse(fromB64(body.content));
  assert.deepEqual(sent, next);
  assert.match(body.message, /favorite game-b/);

  // Restoring keeps the favorite and the existing title.
  next = await store.change({ kind: 'deleted', id: 'game-c', value: false });
  assert.equal(next.deleted['game-c'].deleted, false);
  assert.equal(next.deleted['game-c'].title, 'Charlie');
  assert.equal(next.favorites['game-a'].updated, '2026-01-01T00:00:00.000Z');
  assert.equal(next.favorites['game-b'].updated, '2026-03-04T05:06:07.000Z');

  // Deleting with a Korean title round-trips through base64 and the remote file.
  next = await store.change({ kind: 'deleted', id: 'game-b', title: '한글 패치 게임', value: true });
  assert.equal(next.deleted['game-b'].title, '한글 패치 게임');
  assert.equal(repo.state.deleted['game-b'].title, '한글 패치 게임');
  assert.equal(store.data.deleted['game-b'].title, '한글 패치 게임');

  // The cache stays aligned with the latest successful remote state.
  assert.deepEqual(JSON.parse(storage.getItem(C.CACHE_KEY)), next);

  // Unfavoriting removes only that favorite.
  next = await store.change({ kind: 'favorite', id: 'game-b', value: false });
  assert.equal(next.favorites['game-b'], undefined);
  assert.deepEqual(next.favorites, { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } });
  assert.equal(next.deleted['game-b'].title, '한글 패치 게임');
}

async function testConflictRetryPreservesOtherWriter() {
  var repo = createRepo({
    state: {
      version: 1,
      favorites: { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } },
      deleted: {}
    }
  });
  repo.conflicts = 1;
  repo.conflictAdditions = [{ kind: 'favorite', id: 'game-z', title: 'Zulu' }];
  var store = createStore(repo, { storage: createStorage() });
  store.setToken('good-token');
  await store.load();

  var next = await store.change({ kind: 'favorite', id: 'game-b', value: true });
  assert.equal(repo.putAttempts, 2);
  assert.equal(repo.putCount, 1);
  assert.deepEqual(Object.keys(next.favorites).sort(), ['game-a', 'game-b', 'game-z']);
  assert.deepEqual(Object.keys(repo.state.favorites).sort(), ['game-a', 'game-b', 'game-z']);
  assert.deepEqual(store.data, next);

  // The retried PUT used the new SHA from the re-read.
  var puts = callsTo(repo, 'PUT');
  assert.notEqual(JSON.parse(puts[0].body).sha, JSON.parse(puts[1].body).sha);
}

async function testFailedSaveKeepsPreviousState() {
  var repo = createRepo({
    state: {
      version: 1,
      favorites: { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } },
      deleted: {}
    }
  });
  var storage = createStorage();
  var store = createStore(repo, { storage: storage });
  store.setToken('good-token');
  await store.load();
  var before = clone(store.data);
  var beforeCache = storage.getItem(C.CACHE_KEY);

  repo.putStatus = 500;
  await expectReject(store.change({ kind: 'favorite', id: 'game-b', value: true }), /HTTP 500/);
  assert.equal(store.busy, false);
  assert.deepEqual(store.data, before);
  assert.equal(storage.getItem(C.CACHE_KEY), beforeCache);
  assert.equal(repo.state.favorites['game-b'], undefined);

  repo.putStatus = null;
  store.setToken('bad-token');
  await expectReject(store.change({ kind: 'favorite', id: 'game-b', value: true }), /401|token/i);
  assert.deepEqual(store.data, before);

  // Recovery after the server comes back.
  store.setToken('good-token');
  repo.putStatus = null;
  var next = await store.change({ kind: 'favorite', id: 'game-b', value: true });
  assert.ok(next.favorites['game-b']);
}

async function testTokenChangeRace() {
  var repo = createRepo({
    state: {
      version: 1,
      favorites: {},
      deleted: {}
    }
  });
  var store = createStore(repo, { storage: createStorage() });
  store.setToken('good-token');

  var fired = false;
  repo.beforeRead = function () {
    if (!fired) {
      fired = true;
      store.setToken('rotated-token');
    }
  };

  await expectReject(store.change({ kind: 'favorite', id: 'game-b', value: true }), /token changed/i);
  assert.equal(fired, true);
  assert.equal(repo.putAttempts, 0);
  assert.equal(store.busy, false);
  assert.equal(store.data.favorites['game-b'], undefined);
  assert.equal(repo.state.favorites['game-b'], undefined);
}

async function testDoubleClickGuard() {
  var repo = createRepo({
    state: {
      version: 1,
      favorites: {},
      deleted: {}
    }
  });
  var store = createStore(repo, { storage: createStorage() });
  store.setToken('good-token');

  var release;
  repo.readGate = new Promise(function (resolve) { release = resolve; });
  var first = store.change({ kind: 'favorite', id: 'game-b', value: true });
  assert.equal(store.busy, true);

  await expectReject(store.change({ kind: 'favorite', id: 'game-a', value: true }), /in progress/);
  release();

  var next = await first;
  assert.equal(store.busy, false);
  assert.ok(next.favorites['game-b']);
  assert.equal(repo.putAttempts, 1);
}

async function testChangeValidationAndNoToken() {
  var repo = createRepo({ state: emptyState() });
  var store = createStore(repo, { storage: createStorage() });

  await expectReject(store.change({ kind: 'favorite', id: 'game-b', value: true }), /token is required/);
  assert.equal(repo.calls.length, 0);

  store.setToken('good-token');
  await expectReject(store.change({ kind: 'favorite', id: 'game-x', value: true }), /Unknown game id/);
  await expectReject(store.change({ kind: 'favorite', id: 'Bad_Id', value: true }), /valid game id/);
  await expectReject(store.change({ kind: 'other', id: 'game-a', value: true }), /kind/);
  await expectReject(store.change({ kind: 'favorite', id: 'game-a', value: 'yes' }), /boolean/);
  assert.equal(repo.putAttempts, 0);
}


async function testUnverifiedPermissionAndBlockedStorage() {
  var storage = createStorage();
  var store = ReviewSync.createStore({storage:storage,fetcher:async function(){return response(200,{});}});
  store.setToken('test-value');
  assert.equal(await store.verifyToken(), false, 'readable repo without push permission is not write verified');
  var blocked = ReviewSync.createStore({storage:{getItem:function(){return null;},setItem:function(){throw new Error('blocked');},removeItem:function(){}}});
  assert.throws(function(){blocked.setToken('test-value');}, /저장할 수 없습니다/);
  assert.equal(blocked.getToken(),'');
}

async function main() {
  await testUnverifiedPermissionAndBlockedStorage();
  await testTokenPersistenceAndFallback();
  await testLoadAndCache();
  await testVerifyToken();
  await testChangeMergesAndPreservesUnrelated();
  await testConflictRetryPreservesOtherWriter();
  await testFailedSaveKeepsPreviousState();
  await testTokenChangeRace();
  await testDoubleClickGuard();
  await testChangeValidationAndNoToken();
  console.log('sync tests passed');
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
