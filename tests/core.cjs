'use strict';

var assert = require('node:assert/strict');
var core = require('../docs/assets/review-core.js');

function minimal(overrides) {
  return Object.assign({
    id: 'game-a',
    title: 'Alpha',
    platforms: ['psp'],
    genres: ['ADV'],
    score: 8
  }, overrides || {});
}

function normalizeOne(overrides) {
  return core.normalizeCatalog({ version: 1, games: [minimal(overrides)] }).games[0];
}

function normalizedGames(list) {
  return core.normalizeCatalog({ version: 1, games: list }).games;
}

function ids(games) {
  return games.map(function (game) { return game.id; });
}

function expectThrow(fn, pattern) {
  assert.throws(fn, function (error) {
    if (!(error instanceof Error)) return false;
    if (pattern && !pattern.test(error.message)) {
      throw new Error('Unexpected error message: ' + error.message);
    }
    return true;
  });
}

function testPlatforms() {
  var expected = [
    'ps1', 'ps2', 'psp', 'psvita', 'ps3', 'ps4', 'ps5', 'dreamcast',
    'ds', '3ds', 'switch', 'pc', 'pc98', 'saturn', 'snes', 'gba', 'other'
  ];
  assert.deepEqual(core.PLATFORMS.map(function (platform) { return platform.id; }), expected);
  assert.deepEqual(core.PLATFORM_IDS, expected);
  core.PLATFORMS.forEach(function (platform) {
    assert.equal(typeof platform.label, 'string');
    assert.ok(platform.label.length > 0);
    assert.equal(core.PLATFORM_LABELS[platform.id], platform.label);
  });
}

function testNormalization() {
  var catalog = core.normalizeCatalog({ version: 1, games: [minimal()] });
  assert.equal(catalog.version, 1);
  assert.equal(catalog.games.length, 1);
  var game = catalog.games[0];
  assert.equal(game.id, 'game-a');
  assert.deepEqual(game.platforms, ['psp']);
  assert.deepEqual(game.genres, ['ADV']);
  assert.equal(game.score, 8);
  assert.equal(game.original, '');
  assert.equal(game.summary, '');
  assert.deepEqual(game.pros, []);
  assert.deepEqual(game.cons, []);
  assert.deepEqual(game.sources, []);
  assert.deepEqual(game.patch, { status: 'unconfirmed', url: '', notes: '' });
  assert.equal(game.reviewedAt, '');
  assert.equal(game.reviewer, '');

  // Zero is a real rating, not "unrated".
  assert.equal(normalizeOne({ score: 0 }).score, 0);
  assert.equal(normalizeOne({ score: null }).score, null);

  var full = normalizeOne({
    title: '  한글 패치 게임  ',
    original: '  Original  ',
    summary: '  Summary  ',
    score: 9.5,
    platforms: ['psp', 'psp', 'ps2'],
    genres: ['ADV', 'ADV', 'RPG'],
    pros: [' 좋다 ', ''],
    cons: ['나쁘다'],
    sources: [{ label: '출처', url: 'https://example.com/review' }],
    patch: { status: 'available', url: 'https://example.com/patch.zip', notes: ' 최신 ' },
    reviewedAt: '2026-02-28',
    reviewer: ' Reviewer '
  });
  assert.equal(full.title, '한글 패치 게임');
  assert.equal(full.original, 'Original');
  assert.equal(full.summary, 'Summary');
  assert.deepEqual(full.platforms, ['psp', 'ps2']);
  assert.deepEqual(full.genres, ['ADV', 'RPG']);
  assert.deepEqual(full.pros, ['좋다']);
  assert.deepEqual(full.patch, {
    status: 'available',
    url: 'https://example.com/patch.zip',
    notes: '최신'
  });
  assert.equal(full.reviewedAt, '2026-02-28');

  // Separate PC-98 entries and box art from Windows/modern PC.
  var legacy = normalizeOne({
    id: 'shizuku-pc98', title: '시즈쿠', platforms: ['pc98'],
    cover: { url: 'https://example.com/box.jpg', source: 'https://example.com/listing', platform: 'pc98', type: 'Box - Front', region: 'Japan' }
  });
  assert.deepEqual(legacy.platforms, ['pc98']);
  assert.equal(legacy.cover.platform, 'pc98');
  assert.equal(core.PLATFORM_LABELS.pc98, 'PC-98');
  assert.deepEqual(ids(core.selectGames([legacy], { platform: 'pc98' }, core.emptyState())), ['shizuku-pc98']);
  assert.deepEqual(ids(core.selectGames([legacy], { platform: 'pc' }, core.emptyState())), []);

  // Required fields.
  expectThrow(function () {
    core.normalizeCatalog({ version: 1, games: [{ title: 'No id', platforms: ['psp'], genres: ['ADV'], score: 1 }] });
  }, /\.id/);
  expectThrow(function () {
    core.normalizeCatalog({ version: 1, games: [{ id: 'game-a', platforms: ['psp'], genres: ['ADV'], score: 1 }] });
  }, /\.title/);
  expectThrow(function () {
    core.normalizeCatalog({ version: 1, games: [{ id: 'game-a', title: 'A', platforms: [], genres: ['ADV'], score: 1 }] });
  }, /\.platforms/);
  expectThrow(function () {
    core.normalizeCatalog({ version: 1, games: [{ id: 'game-a', title: 'A', platforms: ['psp'], genres: [], score: 1 }] });
  }, /\.genres/);
  expectThrow(function () {
    core.normalizeCatalog({ version: 1, games: [{ id: 'game-a', title: 'A', platforms: ['psp'], genres: ['ADV'] }] });
  }, /score is required/);

  // Invalid scores: strings, NaN/Infinity, out of range.
  ['8', '', NaN, Infinity, -Infinity, -0.01, 10.01, true].forEach(function (score) {
    expectThrow(function () { normalizeOne({ score: score }); }, /\.score/);
  });

  // Invalid ids and duplicate ids.
  ['Game-A', 'game_a', '-game', '', 'a'.repeat(101)].forEach(function (id) {
    expectThrow(function () { normalizeOne({ id: id }); }, /\.id/);
  });
  expectThrow(function () {
    core.normalizeCatalog({
      version: 1,
      games: [minimal({ id: 'same' }), minimal({ id: 'same' })]
    });
  }, /Duplicate game id/);

  // Unknown platform and malformed arrays.
  expectThrow(function () { normalizeOne({ platforms: ['gamecube'] }); }, /platform/);
  expectThrow(function () { normalizeOne({ genres: 'ADV' }); }, /\.genres/);
  expectThrow(function () { normalizeOne({ pros: 'good' }); }, /\.pros/);

  // Catalog-level validation.
  expectThrow(function () { core.normalizeCatalog(null); }, /Catalog/);
  expectThrow(function () { core.normalizeCatalog({ version: 2, games: [] }); }, /version/);
  expectThrow(function () { core.normalizeCatalog({ version: 1, games: {} }); }, /games/);

  // Dates and URLs.
  expectThrow(function () { normalizeOne({ reviewedAt: '2026-02-30' }); }, /reviewedAt/);
  expectThrow(function () { normalizeOne({ reviewedAt: '2026/02/28' }); }, /reviewedAt/);
  expectThrow(function () {
    normalizeOne({ sources: [{ label: 'bad', url: 'javascript:alert(1)' }] });
  }, /safe http/);
  expectThrow(function () {
    normalizeOne({ sources: [{ label: 'bad', url: 'data:text/html,hi' }] });
  }, /safe http/);
  expectThrow(function () { normalizeOne({ patch: { status: 'soon' } }); }, /patch\.status/);
  expectThrow(function () { normalizeOne({ patch: { url: 'javascript:alert(1)' } }); }, /patch\.url/);
}

function testState() {
  var empty = core.emptyState();
  assert.deepEqual(empty, { version: 1, favorites: {}, deleted: {} });

  var state = core.normalizeState({
    version: 1,
    favorites: { 'game-a': { updated: '2026-01-01T00:00:00.000Z' } },
    deleted: {
      'game-b': {
        deleted: true,
        updated: '2026-01-02T00:00:00.000Z',
        title: '삭제된 게임'
      }
    }
  });
  assert.equal(state.favorites['game-a'].updated, '2026-01-01T00:00:00.000Z');
  assert.equal(state.deleted['game-b'].deleted, true);
  assert.equal(state.deleted['game-b'].title, '삭제된 게임');
  assert.equal(core.isFavorite(state, 'game-a'), true);
  assert.equal(core.isFavorite(state, 'missing'), false);
  assert.equal(core.isDeleted(state, 'game-b'), true);
  assert.equal(core.isDeleted(state, 'game-a'), false);

  // A false deleted flag means restored; favorite survives separately.
  state.deleted['game-b'].deleted = false;
  assert.equal(core.isDeleted(state, 'game-b'), false);
  assert.equal(core.isFavorite(state, 'game-a'), true);

  assert.deepEqual(core.normalizeState({ favorites: {}, deleted: {} }), empty);
  expectThrow(function () { core.normalizeState(null); }, /State/);
  expectThrow(function () { core.normalizeState({ version: 2 }); }, /version/);
  expectThrow(function () {
    core.normalizeState({ favorites: { 'Game-A': { updated: '2026-01-01T00:00:00Z' } } });
  }, /invalid game id/);
  expectThrow(function () {
    core.normalizeState({ favorites: { 'game-a': { updated: 'yesterday' } } });
  }, /updated/);
  expectThrow(function () {
    core.normalizeState({ favorites: { 'game-a': { updated: '2026-01-01' } } });
  }, /updated/);
  expectThrow(function () {
    core.normalizeState({ deleted: { 'game-a': { deleted: 'yes', updated: '2026-01-01T00:00:00Z', title: 'A' } } });
  }, /boolean/);
  expectThrow(function () {
    core.normalizeState({ deleted: { 'game-a': { deleted: true, updated: '2026-01-01T00:00:00Z' } } });
  }, /title/);
}

function testSelectionAndOrdering() {
  var games = normalizedGames([
    minimal({ id: 'bravo', title: 'Bravo', score: 8, platforms: ['psp'], genres: ['ADV'] }),
    minimal({ id: 'alpha', title: 'Alpha', score: 8, platforms: ['ps2'], genres: ['RPG'] }),
    minimal({ id: 'charlie', title: 'Charlie', score: 5, platforms: ['psp', 'ps2'], genres: ['ADV', 'RPG'], summary: 'A hidden gem' }),
    minimal({ id: 'delta', title: 'Delta', score: null, platforms: ['switch'], genres: ['ADV'] }),
    minimal({ id: 'echo', title: 'Echo', score: 0, platforms: ['psp'], genres: ['RPG'] }),
    minimal({ id: 'foxtrot', title: 'Foxtrot', score: null, platforms: ['pc'], genres: ['ETC'] })
  ]);

  // Default is score-desc with unrated last.
  assert.deepEqual(ids(core.selectGames(games, {}, core.emptyState())), [
    'alpha', 'bravo', 'charlie', 'echo', 'delta', 'foxtrot'
  ]);
  assert.deepEqual(ids(core.selectGames(games, { sort: 'score-asc' }, core.emptyState())), [
    'echo', 'charlie', 'alpha', 'bravo', 'delta', 'foxtrot'
  ]);

  // Favorites never pin ahead of scored results.
  var favoriteState = core.normalizeState({
    favorites: {
      delta: { updated: '2026-01-01T00:00:00Z' },
      echo: { updated: '2026-01-01T00:00:00Z' }
    },
    deleted: {}
  });
  assert.deepEqual(ids(core.selectGames(games, { sort: 'score-desc' }, favoriteState)), [
    'alpha', 'bravo', 'charlie', 'echo', 'delta', 'foxtrot'
  ]);

  // Ties use title, then id.
  var tied = normalizedGames([
    minimal({ id: 'zulu', title: 'Same', score: 7 }),
    minimal({ id: 'alpha', title: 'Same', score: 7 }),
    minimal({ id: 'mike', title: 'Aardvark', score: 7 })
  ]);
  assert.deepEqual(ids(core.selectGames(tied, { sort: 'score-desc' }, core.emptyState())), [
    'mike', 'alpha', 'zulu'
  ]);
  assert.deepEqual(ids(core.selectGames(tied, { sort: 'title' }, core.emptyState())), [
    'mike', 'alpha', 'zulu'
  ]);

  // Filters: platform, genre, text search and favorites-only.
  assert.deepEqual(ids(core.selectGames(games, { platform: 'psp' }, core.emptyState())), [
    'bravo', 'charlie', 'echo'
  ]);
  assert.deepEqual(ids(core.selectGames(games, { genre: 'RPG' }, core.emptyState())), [
    'alpha', 'charlie', 'echo'
  ]);
  assert.deepEqual(ids(core.selectGames(games, { q: 'hidden' }, core.emptyState())), ['charlie']);
  assert.deepEqual(ids(core.selectGames(games, { q: 'ALPHA' }, core.emptyState())), ['alpha']);
  assert.deepEqual(ids(core.selectGames(games, { favoriteOnly: true }, favoriteState)), [
    'echo', 'delta'
  ]);

  // Deleted entries are excluded from the active view and visible in the deleted view.
  var deletedState = core.normalizeState({
    favorites: { charlie: { updated: '2026-01-01T00:00:00Z' } },
    deleted: {
      charlie: { deleted: true, updated: '2026-01-02T00:00:00Z', title: 'Charlie' }
    }
  });
  assert.deepEqual(ids(core.selectGames(games, {}, deletedState)), [
    'alpha', 'bravo', 'echo', 'delta', 'foxtrot'
  ]);
  assert.deepEqual(ids(core.selectGames(games, { view: 'deleted' }, deletedState)), ['charlie']);
  assert.deepEqual(ids(core.selectGames(games, { view: 'deleted', favoriteOnly: true }, deletedState)), ['charlie']);

  // Restoring keeps the favorite.
  deletedState.deleted.charlie.deleted = false;
  assert.equal(core.isFavorite(deletedState, 'charlie'), true);
  assert.equal(core.isDeleted(deletedState, 'charlie'), false);
  assert.ok(ids(core.selectGames(games, { favoriteOnly: true }, deletedState)).indexOf('charlie') !== -1);
  assert.deepEqual(ids(core.selectGames(games, { view: 'deleted' }, deletedState)), []);

  // Input list is not mutated.
  assert.equal(games[0].id, 'bravo');
  assert.equal(games.length, 6);
}

function testEscapingAndUrls() {
  assert.equal(
    core.escapeHtml('<a href="x">&\'</a>'),
    '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
  );
  assert.equal(core.escapeHtml(null), '');
  assert.equal(core.escapeHtml(0), '0');

  assert.equal(core.safeUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
  assert.equal(core.safeUrl('  http://example.com  '), 'http://example.com');
  assert.equal(core.safeUrl('javascript:alert(1)'), '');
  assert.equal(core.safeUrl('JavaScript:alert(1)'), '');
  assert.equal(core.safeUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(core.safeUrl('file:///C:/secret.txt'), '');
  assert.equal(core.safeUrl('ftp://example.com/a'), '');
  assert.equal(core.safeUrl('/relative/path'), '');
  assert.equal(core.safeUrl('//example.com/path'), '');
  assert.equal(core.safeUrl('mailto:test@example.com'), '');
  assert.equal(core.safeUrl(''), '');
  assert.equal(core.safeUrl(null), '');
}

testPlatforms();
testNormalization();
testState();
testSelectionAndOrdering();
testEscapingAndUrls();

console.log('core tests passed');
