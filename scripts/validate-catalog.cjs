#!/usr/bin/env node
'use strict';

/**
 * 카탈로그/상태 데이터 검증기.
 *
 * 외부 스키마 라이브러리 없이 docs/assets/review-core.js 의 normalizeCatalog /
 * normalizeState 를 그대로 사용한다. 사이트가 읽는 것과 같은 정규화 경로로
 * 검증하므로, 여기서 통과한 데이터는 앱에서도 유효하다.
 *
 * 사용법: node scripts/validate-catalog.cjs
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CORE_PATH = path.join(ROOT, 'docs', 'assets', 'review-core.js');
const GAMES_PATH = 'docs/data/games.json';
const STATE_PATH = 'docs/data/user-state.json';
const TEMPLATE_PATH = 'templates/review-entry.json';

function loadCore() {
  let core;
  try {
    core = require(CORE_PATH);
  } catch (error) {
    throw new Error(
      `docs/assets/review-core.js 를 불러오지 못했습니다. (${error.message})`
    );
  }

  // UMD 모듈이 default 로 감싸 내보내는 경우도 허용한다.
  if (!core || typeof core.normalizeCatalog !== 'function') {
    if (core && core.default && typeof core.default.normalizeCatalog === 'function') {
      core = core.default;
    }
  }

  if (!core || typeof core.normalizeCatalog !== 'function') {
    throw new Error('review-core.js 가 normalizeCatalog 를 내보내지 않습니다.');
  }
  if (typeof core.normalizeState !== 'function') {
    throw new Error('review-core.js 가 normalizeState 를 내보내지 않습니다.');
  }
  return core;
}

function readJson(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  let text;
  try {
    text = fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`${relativePath} 파일을 읽을 수 없습니다. (${error.message})`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${relativePath} 의 JSON 구문이 올바르지 않습니다. (${error.message})`);
  }
}

function main() {
  const core = loadCore();

  const rawCatalog = readJson(GAMES_PATH);
  if (!rawCatalog || rawCatalog.version !== 1) {
    throw new Error(`${GAMES_PATH} 의 version 은 1이어야 합니다.`);
  }
  if (!Array.isArray(rawCatalog.games)) {
    throw new Error(`${GAMES_PATH} 의 games 는 배열이어야 합니다.`);
  }

  const catalog = core.normalizeCatalog(rawCatalog);
  if (!catalog || catalog.version !== 1 || !Array.isArray(catalog.games)) {
    throw new Error('normalizeCatalog 결과가 { version: 1, games: [] } 형태가 아닙니다.');
  }
  if (catalog.games.length !== rawCatalog.games.length) {
    throw new Error('normalizeCatalog 가 일부 게임을 누락했습니다.');
  }

  const rawTemplate = readJson(TEMPLATE_PATH);
  if (!rawTemplate || typeof rawTemplate !== 'object' || Array.isArray(rawTemplate)) {
    throw new Error(`${TEMPLATE_PATH} 는 게임 객체 하나여야 합니다.`);
  }
  if (rawTemplate.score !== null) {
    throw new Error(`${TEMPLATE_PATH} 의 score 는 null 이어야 합니다. (미평가 템플릿)`);
  }

  const templateCatalog = core.normalizeCatalog({
    version: 1,
    games: [rawTemplate]
  });
  const template = templateCatalog.games[0];
  if (!template) {
    throw new Error(`${TEMPLATE_PATH} 가 유효한 게임 레코드로 정규화되지 않았습니다.`);
  }
  if (template.score !== null) {
    throw new Error(`${TEMPLATE_PATH} 의 정규화된 score 가 null 이 아닙니다.`);
  }

  const templateLeak = catalog.games.find((game) => game.id === template.id);
  if (templateLeak) {
    throw new Error(
      `템플릿 ID "${template.id}" 가 ${GAMES_PATH} 에 실제 항목으로 들어가 있습니다. ` +
        '템플릿을 복사했다면 ID와 내용을 실제 게임 정보로 교체하세요.'
    );
  }

  const rawState = readJson(STATE_PATH);
  if (!rawState || rawState.version !== 1) {
    throw new Error(`${STATE_PATH} 의 version 은 1이어야 합니다.`);
  }
  const normalizedState = core.normalizeState(rawState);
  const state = normalizedState && typeof normalizedState === 'object' ? normalizedState : rawState;

  const favoriteCount = Object.keys(state.favorites || {}).length;
  const deletedCount = Object.keys(state.deleted || {}).length;

  console.log(`[ok] ${GAMES_PATH} — 게임 ${catalog.games.length}개`);
  console.log(`[ok] ${TEMPLATE_PATH} — 미평가 템플릿 (score: null)`);
  console.log(
    `[ok] ${STATE_PATH} — 즐겨찾기 ${favoriteCount}개 / 삭제 표시 ${deletedCount}개`
  );
  console.log('데이터 검증 통과');
}

try {
  main();
} catch (error) {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
}
