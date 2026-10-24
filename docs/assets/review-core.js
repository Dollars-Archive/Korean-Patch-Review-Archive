/*
 * Korean-Patch-Review-Archive - shared core
 *
 * Browser: window.ReviewCore
 * Node:    module.exports
 *
 * No dependencies. This file owns validation, normalization, state helpers and
 * the list selection/sorting rules used by the review UI.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var api = factory();
    root.ReviewCore = api;
    if (root.window && root.window !== root) root.window.ReviewCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ID_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
  var GAME_KEYS = [
    'id', 'title', 'original', 'platforms', 'genres', 'score', 'summary',
    'pros', 'cons', 'sources', 'cover', 'patch', 'reviewedAt', 'reviewer'
  ];

  // The single source of truth for platform ids. Metadata may extend this list
  // here, and both validation and the UI read the same constant.
  var PLATFORMS = [
    { id: 'ps1', label: '플레이스테이션' },
    { id: 'ps2', label: '플레이스테이션 2' },
    { id: 'psp', label: 'PSP' },
    { id: 'psvita', label: 'PS Vita' },
    { id: 'ps3', label: '플레이스테이션 3' },
    { id: 'ps4', label: '플레이스테이션 4' },
    { id: 'ps5', label: '플레이스테이션 5' },
    { id: 'dreamcast', label: '드림캐스트' },
    { id: 'ds', label: '닌텐도 DS' },
    { id: '3ds', label: '닌텐도 3DS' },
    { id: 'switch', label: '닌텐도 스위치' },
    { id: 'pc', label: 'PC' },
    { id: 'saturn', label: '세가 새턴' },
    { id: 'snes', label: '슈퍼 닌텐도' },
    { id: 'gba', label: '게임보이 어드밴스' },
    { id: 'other', label: '기타' }
  ];

  var PLATFORM_IDS = PLATFORMS.map(function (platform) { return platform.id; });
  var PLATFORM_LABELS = {};
  PLATFORMS.forEach(function (platform) { PLATFORM_LABELS[platform.id] = platform.label; });

  var PATCH_STATUSES = ['available', 'unconfirmed', 'stopped'];
  var SORTS = ['score-desc', 'score-asc', 'title'];
  var FILTER_DEFAULTS = {
    platform: 'all',
    genre: 'all',
    q: '',
    favoriteOnly: false,
    view: 'active',
    sort: 'score-desc'
  };

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function fail(message) {
    throw new Error(message);
  }

  function owns(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isPlatformId(value) {
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i].id === value) return true;
    }
    return false;
  }

  function validId(value) {
    return typeof value === 'string' && ID_RE.test(value);
  }

  function isIsoTimestamp(value) {
    if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return false;
    var time = Date.parse(value);
    return !isNaN(time);
  }

  function isIsoDate(value) {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    var parts = value.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var day = Number(parts[2]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
  }

  function requiredString(value, path) {
    if (typeof value !== 'string' || value.trim() === '') {
      fail(path + ' must be a non-empty string.');
    }
    return value.trim();
  }

  function optionalString(value, path, fallback) {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'string') fail(path + ' must be a string.');
    return value.trim();
  }

  function stringArray(value, path, options) {
    options = options || {};
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail(path + ' must be an array of strings.');
    var result = [];
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string') {
        fail(path + '[' + i + '] must be a string.');
      }
      var item = value[i].trim();
      if (item !== '' && (!options.unique || result.indexOf(item) === -1)) {
        result.push(item);
      }
    }
    return result;
  }

  function normalizeGame(raw, index, seenIds) {
    var path = 'Game at index ' + index;
    if (!isPlainObject(raw)) fail(path + ' must be an object.');

    var id = requiredString(raw.id, path + '.id');
    if (!validId(id)) {
      fail(path + '.id must be a lowercase ASCII slug matching /^[a-z0-9][a-z0-9-]{0,99}$/.');
    }
    if (seenIds.has(id)) fail('Duplicate game id "' + id + '".');
    seenIds.add(id);

    var title = requiredString(raw.title, path + '.title');

    if (!Array.isArray(raw.platforms) || raw.platforms.length === 0) {
      fail(path + '.platforms must be a non-empty array of known platform ids.');
    }
    var platforms = [];
    raw.platforms.forEach(function (platform, platformIndex) {
      if (typeof platform !== 'string' || !isPlatformId(platform)) {
        fail(path + '.platforms[' + platformIndex + '] is not a known platform id.');
      }
      if (platforms.indexOf(platform) === -1) platforms.push(platform);
    });

    var genres = stringArray(raw.genres, path + '.genres', { unique: true });
    if (!Array.isArray(raw.genres) || genres.length === 0) {
      fail(path + '.genres must be a non-empty array of strings.');
    }

    if (!owns(raw, 'score')) fail(path + '.score is required (null for unrated).');
    var score = raw.score;
    if (score !== null) {
      if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 10) {
        fail(path + '.score must be null or a number from 0 to 10.');
      }
    }

    var original = optionalString(raw.original, path + '.original', '');
    var summary = optionalString(raw.summary, path + '.summary', '');
    var pros = stringArray(raw.pros, path + '.pros');
    var cons = stringArray(raw.cons, path + '.cons');

    var sources = [];
    if (raw.sources !== undefined && raw.sources !== null) {
      if (!Array.isArray(raw.sources)) fail(path + '.sources must be an array.');
      raw.sources.forEach(function (source, sourceIndex) {
        var sourcePath = path + '.sources[' + sourceIndex + ']';
        if (!isPlainObject(source)) fail(sourcePath + ' must be an object.');
        var label = optionalString(source.label, sourcePath + '.label', '');
        var url = requiredString(source.url, sourcePath + '.url');
        if (safeUrl(url) === '') {
          fail(sourcePath + '.url must be a safe http(s) URL.');
        }
        sources.push({ label: label, url: url });
      });
    }

    var cover = { url: '', source: '', platform: '', type: '', region: '' };
    if (raw.cover !== undefined && raw.cover !== null) {
      if (!isPlainObject(raw.cover)) fail(path + '.cover must be an object.');
      Object.keys(cover).forEach(function (key) {
        cover[key] = optionalString(raw.cover[key], path + '.cover.' + key, '');
      });
      if (cover.url !== '') {
        var localCover = /^covers\/[a-z0-9][a-z0-9-]*\.webp$/.test(cover.url);
        if (!localCover && safeUrl(cover.url) === '') fail(path + '.cover.url must be a local cover or safe http(s) image URL.');
        if (safeUrl(cover.source) === '') fail(path + '.cover.source must identify the verified source page.');
        if (platforms.indexOf(cover.platform) === -1) fail(path + '.cover.platform must match a reviewed platform.');
      }
    }

    var patch = { status: 'unconfirmed', url: '', notes: '' };
    if (raw.patch !== undefined && raw.patch !== null) {
      if (!isPlainObject(raw.patch)) fail(path + '.patch must be an object.');
      if (raw.patch.status !== undefined) {
        if (PATCH_STATUSES.indexOf(raw.patch.status) === -1) {
          fail(path + '.patch.status must be one of: ' + PATCH_STATUSES.join(', ') + '.');
        }
        patch.status = raw.patch.status;
      }
      if (raw.patch.url !== undefined && raw.patch.url !== null) {
        var patchUrl = optionalString(raw.patch.url, path + '.patch.url', '');
        if (patchUrl !== '' && safeUrl(patchUrl) === '') {
          fail(path + '.patch.url must be a safe http(s) URL or an empty string.');
        }
        patch.url = patchUrl;
      }
      if (raw.patch.notes !== undefined && raw.patch.notes !== null) {
        if (typeof raw.patch.notes !== 'string') fail(path + '.patch.notes must be a string.');
        patch.notes = raw.patch.notes.trim();
      }
    }

    var reviewedAt = optionalString(raw.reviewedAt, path + '.reviewedAt', '');
    if (reviewedAt !== '' && !isIsoDate(reviewedAt)) {
      fail(path + '.reviewedAt must be an empty string or a valid YYYY-MM-DD date.');
    }
    var reviewer = optionalString(raw.reviewer, path + '.reviewer', '');

    var game = {
      id: id,
      title: title,
      original: original,
      platforms: platforms,
      genres: genres,
      score: score,
      summary: summary,
      pros: pros,
      cons: cons,
      sources: sources,
      cover: cover,
      patch: patch,
      reviewedAt: reviewedAt,
      reviewer: reviewer
    };

    // Keep the property order stable for readable JSON output.
    var ordered = {};
    GAME_KEYS.forEach(function (key) { ordered[key] = game[key]; });
    return ordered;
  }

  function normalizeCatalog(input) {
    if (!isPlainObject(input)) fail('Catalog must be an object.');
    if (input.version !== undefined && input.version !== 1) {
      fail('Catalog version must be 1.');
    }
    if (!Array.isArray(input.games)) fail('Catalog.games must be an array.');
    var seenIds = new Set();
    var games = input.games.map(function (game, index) {
      return normalizeGame(game, index, seenIds);
    });
    return { version: 1, games: games };
  }

  function emptyState() {
    return { version: 1, favorites: {}, deleted: {} };
  }

  function normalizeState(input) {
    if (!isPlainObject(input)) fail('State must be an object.');
    if (input.version !== undefined && input.version !== 1) {
      fail('State version must be 1.');
    }

    var favoritesInput = input.favorites === undefined || input.favorites === null
      ? {}
      : input.favorites;
    if (!isPlainObject(favoritesInput)) fail('State.favorites must be an object.');

    var favorites = {};
    Object.keys(favoritesInput).forEach(function (id) {
      if (!validId(id)) fail('State.favorites contains an invalid game id "' + id + '".');
      var entry = favoritesInput[id];
      if (!isPlainObject(entry)) fail('State.favorites["' + id + '"] must be an object.');
      if (!isIsoTimestamp(entry.updated)) {
        fail('State.favorites["' + id + '"].updated must be an ISO timestamp.');
      }
      favorites[id] = { updated: entry.updated };
    });

    var deletedInput = input.deleted === undefined || input.deleted === null
      ? {}
      : input.deleted;
    if (!isPlainObject(deletedInput)) fail('State.deleted must be an object.');

    var deleted = {};
    Object.keys(deletedInput).forEach(function (id) {
      if (!validId(id)) fail('State.deleted contains an invalid game id "' + id + '".');
      var entry = deletedInput[id];
      if (!isPlainObject(entry)) fail('State.deleted["' + id + '"] must be an object.');
      if (typeof entry.deleted !== 'boolean') {
        fail('State.deleted["' + id + '"].deleted must be a boolean.');
      }
      if (!isIsoTimestamp(entry.updated)) {
        fail('State.deleted["' + id + '"].updated must be an ISO timestamp.');
      }
      if (typeof entry.title !== 'string') {
        fail('State.deleted["' + id + '"].title must be a string.');
      }
      deleted[id] = {
        deleted: entry.deleted,
        updated: entry.updated,
        title: entry.title
      };
    });

    return { version: 1, favorites: favorites, deleted: deleted };
  }

  function isFavorite(state, id) {
    return !!(state && isPlainObject(state.favorites) && owns(state.favorites, id) && state.favorites[id]);
  }

  function isDeleted(state, id) {
    return !!(state && isPlainObject(state.deleted) && owns(state.deleted, id) &&
      state.deleted[id] && state.deleted[id].deleted === true);
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (character) {
      switch (character) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return character;
      }
    });
  }

  function safeUrl(value) {
    if (typeof value !== 'string') return '';
    var trimmed = value.trim();
    if (trimmed === '') return '';
    // Reject control characters before handing anything to URL().
    if (/[\u0000-\u001F\u007F]/.test(trimmed)) return '';
    var parsed;
    try {
      parsed = new URL(trimmed);
    } catch (error) {
      return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!parsed.hostname) return '';
    return trimmed;
  }

  function scoreValue(game) {
    return typeof game.score === 'number' && isFinite(game.score) ? game.score : null;
  }

  function compareTitle(a, b) {
    var titleA = typeof a.title === 'string' ? a.title : '';
    var titleB = typeof b.title === 'string' ? b.title : '';
    var titleOrder = titleA.localeCompare(titleB, 'ko');
    if (titleOrder !== 0) return titleOrder;
    var idA = typeof a.id === 'string' ? a.id : '';
    var idB = typeof b.id === 'string' ? b.id : '';
    return idA.localeCompare(idB);
  }

  function compareScores(a, b, direction) {
    var scoreA = scoreValue(a);
    var scoreB = scoreValue(b);
    // Unrated games are always last, in both directions.
    if (scoreA === null && scoreB === null) return compareTitle(a, b);
    if (scoreA === null) return 1;
    if (scoreB === null) return -1;
    if (scoreA !== scoreB) {
      return direction === 'asc' ? scoreA - scoreB : scoreB - scoreA;
    }
    return compareTitle(a, b);
  }

  function matchesQuery(game, query) {
    if (query === '') return true;
    var haystack = [
      game.title,
      game.original,
      game.summary,
      game.reviewer,
      Array.isArray(game.genres) ? game.genres.join(' ') : ''
    ].join(' ').toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function selectGames(games, filters, state) {
    var list = Array.isArray(games) ? games.filter(isPlainObject) : [];
    var options = {};
    Object.keys(FILTER_DEFAULTS).forEach(function (key) {
      options[key] = FILTER_DEFAULTS[key];
    });
    if (isPlainObject(filters)) {
      Object.keys(FILTER_DEFAULTS).forEach(function (key) {
        if (filters[key] !== undefined) options[key] = filters[key];
      });
    }

    var view = options.view === 'deleted' ? 'deleted' : 'active';
    var platform = typeof options.platform === 'string' ? options.platform : 'all';
    var genre = typeof options.genre === 'string' ? options.genre : 'all';
    var query = typeof options.q === 'string' ? options.q.trim().toLowerCase() : '';
    var favoriteOnly = options.favoriteOnly === true;
    var sort = SORTS.indexOf(options.sort) === -1 ? 'score-desc' : options.sort;

    var selected = list.filter(function (game) {
      var removed = isDeleted(state, game.id);
      if (view === 'deleted' ? !removed : removed) return false;
      if (favoriteOnly && !isFavorite(state, game.id)) return false;
      if (platform !== 'all' && (!Array.isArray(game.platforms) || game.platforms.indexOf(platform) === -1)) {
        return false;
      }
      if (genre !== 'all' && (!Array.isArray(game.genres) || game.genres.indexOf(genre) === -1)) {
        return false;
      }
      return matchesQuery(game, query);
    });

    selected.sort(function (a, b) {
      if (sort === 'title') return compareTitle(a, b);
      return compareScores(a, b, sort === 'score-asc' ? 'asc' : 'desc');
    });

    return selected;
  }

  return {
    PLATFORMS: PLATFORMS,
    PLATFORM_IDS: PLATFORM_IDS,
    PLATFORM_LABELS: PLATFORM_LABELS,
    PATCH_STATUSES: PATCH_STATUSES,
    normalizeCatalog: normalizeCatalog,
    emptyState: emptyState,
    normalizeState: normalizeState,
    isFavorite: isFavorite,
    isDeleted: isDeleted,
    selectGames: selectGames,
    escapeHtml: escapeHtml,
    safeUrl: safeUrl
  };
});
