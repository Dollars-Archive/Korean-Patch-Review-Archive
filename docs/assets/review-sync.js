/*
 * Korean-Patch-Review-Archive - shared watchlist sync
 *
 * Browser: window.ReviewSync
 * Node:    module.exports
 *
 * The watchlist is a single public, owner-maintained state file. Reads are
 * public; writes need a GitHub token with repository contents write access.
 * Writes always read the latest SHA first and merge only the requested id so
 * unrelated remote changes are preserved.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var api = factory();
    root.ReviewSync = api;
    if (root.window && root.window !== root) root.window.ReviewSync = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var REPO = 'Dollars-Archive/Korean-Patch-Review-Archive';
  var BRANCH = 'watchlist-data';
  var STATE_PATH = 'docs/data/user-state.json';
  var API_REPO = 'https://api.github.com/repos/' + REPO;
  var API_CONTENT = API_REPO + '/contents/' + STATE_PATH;
  var RAW_CONTENT = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/' + STATE_PATH;

  var TOKEN_KEY = 'patch-review-token-v1';
  var LEGACY_TOKEN_KEY = 'discovery-watchlist-token-v1';
  var FALLBACK_DISABLED_KEY = 'patch-review-fallback-disabled-v1';
  var CACHE_KEY = 'patch-review-archive-state-v1';

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
  var TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function owns(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyState() {
    return { version: 1, favorites: {}, deleted: {} };
  }

  function isIsoTimestamp(value) {
    return typeof value === 'string' && TIMESTAMP_RE.test(value) && !isNaN(Date.parse(value));
  }

  function isOk(response) {
    if (!response) return false;
    if (typeof response.ok === 'boolean') return response.ok;
    var status = typeof response.status === 'number' ? response.status : 200;
    return status >= 200 && status < 300;
  }

  function statusOf(response) {
    return response && typeof response.status === 'number' ? response.status : 0;
  }

  function githubError(message, status) {
    var error = new Error(message);
    if (status) error.status = status;
    error.isGithubError = true;
    return error;
  }

  function messageForStatus(status, detail) {
    if (status === 401) {
      return 'GitHub rejected the token (401). Check that the token is valid and has repository access.';
    }
    if (status === 403) {
      return 'GitHub refused the request (403). The token may lack write permission or the rate limit was reached.';
    }
    if (status === 404) {
      return 'The repository, branch or watchlist file was not found (404).';
    }
    if (status === 409) {
      return 'The watchlist changed while saving (409). Refresh and try again.';
    }
    var suffix = detail ? ': ' + detail : '';
    return 'GitHub returned HTTP ' + (status || 'unknown') + suffix + '.';
  }

  function sanitizeState(raw) {
    if (!isPlainObject(raw)) {
      throw new Error('Watchlist state must be a JSON object.');
    }
    if (raw.version !== undefined && raw.version !== 1) {
      throw new Error('Watchlist state version must be 1.');
    }

    var favoritesRaw = raw.favorites === undefined || raw.favorites === null ? {} : raw.favorites;
    if (!isPlainObject(favoritesRaw)) throw new Error('Watchlist favorites must be an object.');
    var deletedRaw = raw.deleted === undefined || raw.deleted === null ? {} : raw.deleted;
    if (!isPlainObject(deletedRaw)) throw new Error('Watchlist deleted entries must be an object.');

    var favorites = {};
    Object.keys(favoritesRaw).forEach(function (id) {
      if (!ID_RE.test(id)) throw new Error('Watchlist contains an invalid game id "' + id + '".');
      var entry = favoritesRaw[id];
      if (!isPlainObject(entry)) throw new Error('Watchlist favorite "' + id + '" must be an object.');
      if (!isIsoTimestamp(entry.updated)) {
        throw new Error('Watchlist favorite "' + id + '" has an invalid updated timestamp.');
      }
      favorites[id] = { updated: entry.updated };
    });

    var deleted = {};
    Object.keys(deletedRaw).forEach(function (id) {
      if (!ID_RE.test(id)) throw new Error('Watchlist contains an invalid game id "' + id + '".');
      var entry = deletedRaw[id];
      if (!isPlainObject(entry)) throw new Error('Watchlist deleted entry "' + id + '" must be an object.');
      if (typeof entry.deleted !== 'boolean') {
        throw new Error('Watchlist deleted entry "' + id + '" must have a boolean deleted flag.');
      }
      if (!isIsoTimestamp(entry.updated)) {
        throw new Error('Watchlist deleted entry "' + id + '" has an invalid updated timestamp.');
      }
      if (typeof entry.title !== 'string') {
        throw new Error('Watchlist deleted entry "' + id + '" must have a title.');
      }
      deleted[id] = { deleted: entry.deleted, updated: entry.updated, title: entry.title };
    });

    return { version: 1, favorites: favorites, deleted: deleted };
  }

  function parseStateText(text) {
    if (text === undefined || text === null) throw new Error('Watchlist file is empty or unreadable.');
    var trimmed = String(text).trim();
    if (trimmed === '') throw new Error('Watchlist file is empty or unreadable.');
    var raw;
    try {
      raw = JSON.parse(trimmed);
    } catch (error) {
      throw new Error('Watchlist file does not contain valid JSON.');
    }
    return sanitizeState(raw);
  }

  function utf8ToBase64(text) {
    if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.from === 'function') {
      return Buffer.from(text, 'utf8').toString('base64');
    }
    var bytes;
    if (typeof TextEncoder !== 'undefined') {
      bytes = new TextEncoder().encode(text);
    } else {
      var encoded = unescape(encodeURIComponent(text));
      bytes = new Uint8Array(encoded.length);
      for (var i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    }
    var binary = '';
    for (var j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
    return btoa(binary);
  }

  function base64ToUtf8(value) {
    var clean = String(value).replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.from === 'function') {
      return Buffer.from(clean, 'base64').toString('utf8');
    }
    var binary = atob(clean);
    if (typeof TextDecoder !== 'undefined') {
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  }

  function createMemoryStorage() {
    var data = {};
    return {
      _memoryOnly: true,
      getItem: function (key) { return owns(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[key] = String(value); },
      removeItem: function (key) { delete data[key]; }
    };
  }

  function createStore(options) {
    options = options || {};
    var fetcher = typeof options.fetcher === 'function'
      ? options.fetcher
      : (typeof fetch === 'function' ? fetch : null);
    var storage;
    if (options.storage !== undefined) {
      storage = options.storage || createMemoryStorage();
    } else {
      try {
        storage = typeof localStorage !== 'undefined' ? localStorage : createMemoryStorage();
      } catch (error) {
        storage = createMemoryStorage();
      }
    }
    var knownIds = typeof options.knownIds === 'function' ? options.knownIds : null;
    var now = typeof options.now === 'function' ? options.now : function () {
      return new Date().toISOString();
    };
    var mapStyleStorage = !!storage &&
      typeof storage.getItem !== 'function' &&
      typeof storage.get === 'function' &&
      typeof storage.set === 'function';

    var data = emptyState();
    var ready = false;
    var busy = false;

    function readRaw(key) {
      try {
        var value = mapStyleStorage ? storage.get(key) : storage.getItem(key);
        return typeof value === 'string' ? value : '';
      } catch (error) {
        return '';
      }
    }

    function writeRaw(key, value) {
      try {
        if (mapStyleStorage) storage.set(key, value);
        else storage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    }

    function removeRaw(key) {
      try {
        if (mapStyleStorage) {
          if (typeof storage.delete === 'function') storage.delete(key);
          else if (typeof storage.remove === 'function') storage.remove(key);
        } else {
          storage.removeItem(key);
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    function currentTimestamp() {
      var value;
      try {
        value = now();
      } catch (error) {
        value = '';
      }
      return isIsoTimestamp(value) ? value : new Date().toISOString();
    }

    function getToken() {
      var primary = readRaw(TOKEN_KEY).trim();
      if (primary !== '') return primary;
      if (readRaw(FALLBACK_DISABLED_KEY).trim() !== '') return '';
      return readRaw(LEGACY_TOKEN_KEY).trim();
    }

    function setToken(value) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('Token must be a non-empty string.');
      }
      if (storage._memoryOnly || !writeRaw(TOKEN_KEY, value.trim())) {
        throw new Error('브라우저에 열쇠를 저장할 수 없습니다. 저장소 차단 설정을 확인하세요.');
      }
      // An explicit new token overrides a previous "stop using fallback" choice.
      removeRaw(FALLBACK_DISABLED_KEY);
      return true;
    }

    function clearToken() {
      if (!removeRaw(TOKEN_KEY)) {
        throw new Error('브라우저에서 열쇠를 해제하지 못했습니다. 저장소 설정을 확인하세요.');
      }
      // Disable the legacy fallback only in this corner; leave discovery intact.
      if (!writeRaw(FALLBACK_DISABLED_KEY, '1')) {
        throw new Error('브라우저에서 열쇠 사용 중지를 저장하지 못했습니다.');
      }
      return true;
    }

    function apiHeaders(token, extra) {
      var headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      };
      if (token) headers.Authorization = 'Bearer ' + token;
      if (extra) {
        Object.keys(extra).forEach(function (key) { headers[key] = extra[key]; });
      }
      return headers;
    }

    function request(url, requestOptions) {
      if (typeof fetcher !== 'function') {
        return Promise.reject(new Error('No fetch implementation is available.'));
      }
      return Promise.resolve().then(function () {
        return fetcher(url, requestOptions);
      }).then(function (response) {
        if (!response || typeof response !== 'object') {
          throw new Error('The network returned no response.');
        }
        return response;
      }).catch(function (error) {
        if (error && error.isGithubError) throw error;
        throw new Error('Could not reach GitHub. ' + (error && error.message ? error.message : 'Check your connection.'));
      });
    }

    function readJson(response) {
      if (typeof response.json !== 'function') {
        return Promise.reject(new Error('GitHub returned an unreadable response.'));
      }
      return Promise.resolve().then(function () { return response.json(); });
    }

    function readText(response) {
      if (typeof response.text === 'function') {
        return Promise.resolve().then(function () { return response.text(); });
      }
      return readJson(response).then(function (body) {
        return typeof body === 'string' ? body : JSON.stringify(body);
      });
    }

    function responseError(response, action) {
      var status = statusOf(response);
      var detailPromise = Promise.resolve('');
      if (typeof response.json === 'function') {
        detailPromise = readJson(response).then(function (body) {
          return body && typeof body.message === 'string' ? body.message : '';
        }).catch(function () { return ''; });
      }
      return detailPromise.then(function (detail) {
        return githubError(messageForStatus(status, detail), status);
      });
    }

    function readApiState(token) {
      var url = API_CONTENT + '?ref=' + encodeURIComponent(BRANCH) + '&_=' + Date.now();
      return request(url, { method: 'GET', headers: apiHeaders(token), cache: 'no-store' }).then(function (response) {
        if (statusOf(response) === 404) {
          throw githubError(messageForStatus(404), 404);
        }
        if (!isOk(response)) return responseError(response, 'load').then(function (error) { throw error; });
        return readJson(response).then(function (json) {
          if (!json || typeof json !== 'object') {
            throw new Error('GitHub returned an invalid watchlist response.');
          }
          var content = json.content;
          var text = '';
          if (typeof content === 'string' && content !== '') {
            // The contents API always returns base64 for files.
            text = json.encoding === 'base64' || json.encoding === undefined
              ? base64ToUtf8(content)
              : content;
          }
          return {
            state: parseStateText(text),
            sha: typeof json.sha === 'string' ? json.sha : null
          };
        });
      });
    }

    function readRawState() {
      return request(RAW_CONTENT + '?_=' + Date.now(), { method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' })
        .then(function (response) {
          if (statusOf(response) === 404) {
            throw githubError(messageForStatus(404), 404);
          }
          if (!isOk(response)) {
            return responseError(response, 'load').then(function (error) { throw error; });
          }
          return readText(response).then(function (text) {
            return { state: parseStateText(text), sha: null };
          });
        });
    }

    function readPublicState() {
      var apiError = null;
      return readApiState(null).catch(function (error) {
        apiError = error;
        return readRawState().catch(function (rawError) {
          // A missing branch/file is not proof that synchronization is ready.
          var apiMessage = apiError && apiError.message ? apiError.message : 'API read failed.';
          var rawMessage = rawError && rawError.message ? rawError.message : 'Fallback read failed.';
          throw new Error('Could not load the shared watchlist. ' + apiMessage + ' ' + rawMessage);
        });
      });
    }

    function readWritableState(token) {
      var url = API_CONTENT + '?ref=' + encodeURIComponent(BRANCH) + '&_=' + Date.now();
      return request(url, { method: 'GET', headers: apiHeaders(token), cache: 'no-store' }).then(function (response) {
        if (statusOf(response) === 404) {
          return { state: emptyState(), sha: null };
        }
        if (!isOk(response)) return responseError(response, 'save').then(function (error) { throw error; });
        return readJson(response).then(function (json) {
          if (!json || typeof json !== 'object') {
            throw new Error('GitHub returned an invalid watchlist response.');
          }
          var text = '';
          if (typeof json.content === 'string' && json.content !== '') {
            text = json.encoding === 'base64' || json.encoding === undefined
              ? base64ToUtf8(json.content)
              : json.content;
          }
          return {
            state: parseStateText(text),
            sha: typeof json.sha === 'string' ? json.sha : null
          };
        });
      });
    }

    function putState(nextState, sha, token, change) {
      var body = {
        message: 'Update watchlist: ' + change.kind + ' ' + change.id,
        content: utf8ToBase64(JSON.stringify(nextState, null, 2) + '\n'),
        branch: BRANCH
      };
      if (sha) body.sha = sha;
      return request(API_CONTENT, {
        method: 'PUT',
        headers: apiHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      });
    }

    function assertTokenUnchanged(token) {
      if (getToken() !== token) {
        throw new Error('The GitHub token changed during the save. Refresh the page and try again.');
      }
    }

    function validateChange(input) {
      if (!isPlainObject(input)) throw new Error('A watchlist change must be an object.');
      if (input.kind !== 'favorite' && input.kind !== 'deleted') {
        throw new Error('Watchlist change kind must be "favorite" or "deleted".');
      }
      if (typeof input.id !== 'string' || !ID_RE.test(input.id)) {
        throw new Error('Watchlist change id is not a valid game id.');
      }
      if (typeof input.value !== 'boolean') {
        throw new Error('Watchlist change value must be a boolean.');
      }
      if (input.title !== undefined && typeof input.title !== 'string') {
        throw new Error('Watchlist change title must be a string.');
      }
      if (knownIds) {
        var ids = knownIds();
        if (ids) {
          var known;
          if (typeof ids.has === 'function') known = ids.has(input.id);
          else if (Array.isArray(ids)) known = ids.indexOf(input.id) !== -1;
          else known = true;
          if (!known) throw new Error('Unknown game id "' + input.id + '".');
        }
      }
      return {
        kind: input.kind,
        id: input.id,
        title: typeof input.title === 'string' ? input.title.trim() : '',
        value: input.value
      };
    }

    function applyChange(baseState, change) {
      var next = clone(baseState);
      if (!isPlainObject(next.favorites)) next.favorites = {};
      if (!isPlainObject(next.deleted)) next.deleted = {};
      var updated = currentTimestamp();

      if (change.kind === 'favorite') {
        if (change.value) next.favorites[change.id] = { updated: updated };
        else delete next.favorites[change.id];
      } else {
        var previous = owns(next.deleted, change.id) ? next.deleted[change.id] : null;
        var title = change.title !== ''
          ? change.title
          : (previous && typeof previous.title === 'string' ? previous.title : change.id);
        next.deleted[change.id] = {
          deleted: change.value,
          updated: updated,
          title: title
        };
      }
      next.version = 1;
      return next;
    }

    function readCache() {
      var text = readRaw(CACHE_KEY);
      if (text === '') return null;
      try {
        return sanitizeState(JSON.parse(text));
      } catch (error) {
        removeRaw(CACHE_KEY);
        return null;
      }
    }

    function writeCache(state) {
      writeRaw(CACHE_KEY, JSON.stringify(state));
    }

    function load() {
      return readPublicState().then(function (result) {
        data = result.state;
        ready = true;
        writeCache(data);
        return { ready: true, cached: false };
      }).catch(function (error) {
        ready = false;
        var cached = readCache();
        if (cached) {
          data = cached;
          return {
            ready: false,
            cached: true,
            error: error && error.message ? error.message : 'Could not load the shared watchlist.'
          };
        }
        return {
          ready: ready,
          cached: false,
          error: error && error.message ? error.message : 'Could not load the shared watchlist.'
        };
      });
    }

    function verifyToken() {
      var token = getToken();
      if (!token) return Promise.resolve(false);
      return request(API_REPO, { method: 'GET', headers: apiHeaders(token), cache: 'no-store' })
        .then(function (response) {
          var status = statusOf(response);
          if (status === 401 || status === 403 || status === 404) return false;
          if (!isOk(response)) {
            return responseError(response, 'verify').then(function (error) { throw error; });
          }
          return readJson(response).then(function (json) {
            return Boolean(json && json.permissions && json.permissions.push === true);
          }).catch(function () {
            return false;
          });
        });
    }

    function change(input) {
      var descriptor;
      try {
        descriptor = validateChange(input);
      } catch (error) {
        return Promise.reject(error);
      }
      if (busy) {
        return Promise.reject(new Error('Another watchlist save is already in progress.'));
      }
      var token = getToken();
      if (!token) {
        return Promise.reject(new Error('A GitHub token is required to change the shared watchlist.'));
      }

      busy = true;
      return Promise.resolve().then(function () {
        assertTokenUnchanged(token);
        return readWritableState(token);
      }).then(function (latest) {
        assertTokenUnchanged(token);
        var merged = applyChange(latest.state, descriptor);
        return putState(merged, latest.sha, token, descriptor).then(function (response) {
          return { latest: latest, merged: merged, response: response };
        });
      }).then(function (context) {
        if (statusOf(context.response) !== 409) return context;
        // One conflict retry: re-read, reapply only this id and preserve every
        // unrelated change made by the other writer.
        assertTokenUnchanged(token);
        return readWritableState(token).then(function (latest) {
          assertTokenUnchanged(token);
          var merged = applyChange(latest.state, descriptor);
          return putState(merged, latest.sha, token, descriptor).then(function (response) {
            return { latest: latest, merged: merged, response: response };
          });
        });
      }).then(function (context) {
        if (statusOf(context.response) === 409) {
          throw githubError('The watchlist changed again while saving. Refresh and try again.', 409);
        }
        if (!isOk(context.response)) {
          return responseError(context.response, 'save').then(function (error) { throw error; });
        }
        assertTokenUnchanged(token);
        data = context.merged;
        ready = true;
        writeCache(data);
        return data;
      }).finally(function () {
        busy = false;
      });
    }

    return {
      get data() { return data; },
      get ready() { return ready; },
      get busy() { return busy; },
      load: load,
      verifyToken: verifyToken,
      setToken: setToken,
      clearToken: clearToken,
      getToken: getToken,
      change: change
    };
  }

  return {
    createStore: createStore,
    constants: {
      REPO: REPO,
      BRANCH: BRANCH,
      STATE_PATH: STATE_PATH,
      API_REPO: API_REPO,
      API_CONTENT: API_CONTENT,
      RAW_CONTENT: RAW_CONTENT,
      TOKEN_KEY: TOKEN_KEY,
      LEGACY_TOKEN_KEY: LEGACY_TOKEN_KEY,
      FALLBACK_DISABLED_KEY: FALLBACK_DISABLED_KEY,
      CACHE_KEY: CACHE_KEY
    }
  };
});
