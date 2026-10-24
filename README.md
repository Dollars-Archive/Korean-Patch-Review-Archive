# 한글패치, 다운받을까? 말까?

한국어 패치가 있는 게임을 **게임 자체의 품질**과 **패치 적용 가능성**으로 나눠 정리하는 정적 리뷰 아카이브입니다.
패치가 있다는 이유만으로 점수를 올리지 않고, 확인된 사실과 출처만 공개합니다.

- 사이트: <https://dollars-archive.github.io/Korean-Patch-Review-Archive/>
- 저장소: <https://github.com/Dollars-Archive/Korean-Patch-Review-Archive>
- 현재 상태: **공개된 리뷰 0개.** `docs/data/games.json` 은 빈 카탈로그로 시작합니다. 샘플 게임이나 임시 점수는 넣지 않습니다.

프레임워크, CDN, 외부 폰트, 런타임 npm 의존성 없이 HTML/CSS/JS 와 GitHub Pages 로만 동작합니다.
Node.js 는 데이터 검증과 테스트, CI 용으로만 사용합니다.

## 구조

```text
docs/
  index.html                  # 정적 UI
  assets/
    review-core.js            # 카탈로그 정규화·필터·URL 안전 처리 (UMD)
    review-sync.js            # 공유 상태 동기화 (UMD)
    app.js                    # UI
  data/
    games.json                # 공개 카탈로그 (리뷰 데이터)
    user-state.json           # 공유 상태의 기본/배포본
templates/
  review-entry.json           # 빈 리뷰 레코드 템플릿 (사이트에 로드되지 않음)
  WEBGPT-REVIEW-PROMPT.md     # 조사형 리뷰 작성 프롬프트
scripts/
  validate-catalog.cjs        # 카탈로그·템플릿·상태 검증
tests/                        # review-core / review-sync 단위 테스트 (node --test)
.github/workflows/pages.yml   # 검증·테스트 후 Pages 배포
```

## 웹GPT 프로젝트에서 평가·자동 등록

[프로젝트 지침](templates/WEBGPT-PROJECT-INSTRUCTIONS.md)을 웹GPT 프로젝트 설정에 붙여 넣고 [등록 안내](REGISTER-REVIEW.md)를 참고합니다. GitHub 파일 쓰기 도구가 연결돼 있으면 평가 후 해당 게임을 자동 등록합니다. 쓰기 도구가 없으면 JSON을 제공하며 등록 완료로 표시하지 않습니다. 사이트의 찜 편집 열쇠는 웹GPT 쓰기 연결과 별개입니다.

## 리뷰 추가·가져오기

1. `templates/WEBGPT-REVIEW-PROMPT.md` 를 WebGPT에 넣고, 게임명과 플랫폼을 실제 대상으로 바꿔 조사합니다.
   프롬프트는 10점 만점의 근거 있는 점수, 장단점, 출처 URL, 정확한 플랫폼·패치 버전 확인을 요구합니다.
2. 출력된 JSON을 `templates/review-entry.json` 구조와 대조합니다. 템플릿 자체는 사이트에 로드되지 않습니다.
3. `id` 를 아래 **고정 ID 규칙**에 맞게 정하고, 카탈로그에 중복이 없는지 확인합니다.
4. `docs/data/games.json` 의 `games` 배열에 객체를 추가합니다. `version` 은 `1` 그대로 둡니다.
5. 검증합니다.

   ```bash
   node scripts/validate-catalog.cjs
   ```

6. 로컬에서 확인합니다. JSON 을 `fetch` 하므로 파일을 직접 여는 대신 정적 서버를 사용합니다.

   ```bash
   python -m http.server 8000 --directory docs
   # http://localhost:8000
   ```

7. `main` 에 커밋·푸시하면 GitHub Actions 가 검증과 테스트를 통과한 뒤 `docs/` 를 Pages 로 배포합니다.
   Actions 탭에서 `Deploy GitHub Pages` 실행 결과와 배포 URL을 확인합니다.

리뷰를 내릴 때는 카탈로그에서 객체를 제거합니다. 이미 공개한 `id` 는 다시 쓰지 않습니다.

## 고정 ID 규칙

- 형식: `^[a-z0-9][a-z0-9-]{0,99}$`
- ASCII 소문자, 숫자, 하이픈만 사용합니다. 공백·밑줄·한글·대문자는 허용하지 않습니다.
- 첫 글자는 영문 소문자 또는 숫자여야 하고, 전체 길이는 1~100자입니다.
- 카탈로그 전체에서 **고유**해야 합니다.
- 로마자 제목과 플랫폼을 조합해 만듭니다. 예: `some-title-psp`
- **한 번 공개한 ID는 변경하거나 재사용하지 않습니다.** 즐겨찾기와 삭제 표시가 ID를 키로 저장되므로, ID를 바꾸면 사용자의 기존 상태가 끊기고, 삭제한 게임의 ID를 새 게임에 재사용하면 이전 상태가 잘못 이어집니다.

## 데이터 규칙

필수 필드는 `id`, `title`, `platforms`, `genres`, `score` 입니다. 나머지는 정규화 시 기본값이 채워지지만, 리뷰 품질을 위해 직접 채우는 것을 권장합니다.

- `score`: **아직 평가하지 않았으면 `null`**, 평가했으면 **0~10 사이 숫자**입니다. `0` 도 유효한 점수입니다.
  문자열(`"8.5"`), `NaN`, 범위 밖 숫자는 거부됩니다. 점수는 게임 품질만 반영하며 패치 완성도·번역 품질로 점수를 조작하지 않습니다.
- `platforms`: `ps1`, `ps2`, `psp`, `psvita`, `ps3`, `ps4`, `ps5`, `dreamcast`, `ds`, `3ds`, `switch`, `pc`, `saturn`, `snes`, `gba`, `other` 중 실제 확인 범위만 넣습니다.
- `genres`: `ADV`, `RPG`, `ACT` 같은 짧은 코드 1~3개.
- `sources`: `{ "label": "...", "url": "https://..." }` 형태. `https://` 만 허용하며 `javascript:`, `data:`, `http://` 는 거부됩니다.
- `patch.status`:
  - `available`: 검증된 한국어 패치 배포 페이지가 있고 대상 플랫폼에 적용 가능. `patch.url` 에 **실제 HTTPS URL** 이 있어야 하며 카드에 다운로드 링크가 표시됩니다.
  - `unconfirmed`: 패치 존재·버전·적용 여부를 확인하지 못함. `patch.url` 은 빈 문자열, 다운로드 링크 없음.
  - `stopped`: 배포 중단·철회·링크 만료 등. `patch.url` 은 빈 문자열, 다운로드 링크 없음.
- `patch.notes`: 정확한 패치 버전, 확인 날짜, 확인 방법과 한계를 기록합니다. 버전을 모르면 "버전 미확인"이라고 씁니다.
- 게임 ROM/ISO/크랙 등 저작권 게임 파일 링크는 넣지 않습니다. 한국어 패치 배포 페이지만 링크합니다.
- 확인하지 않은 평균 점수, 판매량, 패치 버전, URL을 만들지 않습니다. 근거가 없으면 비우거나 `null` 로 둡니다.

`patch.status` 가 `available` 이 아니면 사이트는 다운로드 버튼을 만들지 않습니다.

## 공유 상태와 키 사용

사이트의 즐겨찾기·삭제 표시는 방문자별 클라우드 계정이 아니라 **저장소 하나를 공유하는 공개 단일 목록**입니다.
상태는 다음 위치에 저장됩니다.

- 저장소: `Dollars-Archive/Korean-Patch-Review-Archive`
- 브랜치: `watchlist-data`
- 경로: `docs/data/user-state.json`
- API: `https://api.github.com/repos/Dollars-Archive/Korean-Patch-Review-Archive`

**키 없이도 사이트를 읽고 공유 상태를 볼 수 있습니다.** 공개 읽기는 인증이 필요 없습니다.
즐겨찾기·삭제·복원처럼 상태를 **쓰려면** 이 저장소에 대한 쓰기 권한이 있는 키가 필요합니다.
키가 없거나 오프라인이거나 저장 중이면 쓰기 버튼은 비활성화되고, 설정에서 키 입력을 안내합니다.

### 키 발급과 입력

- GitHub **fine-grained personal access token** 을 사용합니다.
- 기존 발굴 아카이브 열쇠가 있으면 새로 발급할 필요 없이, 해당 열쇠의 선택 저장소에 **Korean-Patch-Review-Archive**를 추가합니다. 새 열쇠를 발급한다면 이 저장소만 선택해도 됩니다.
- 권한은 **Contents: Read and write** 만 부여합니다. (Metadata read 는 GitHub가 자동 포함)
- 키는 브라우저의 `localStorage` 에만 저장됩니다.
  - 기본 키: `patch-review-token-v1`
  - 기존 `discovery-watchlist-token-v1` 키가 있고 이 사이트에서 비활성화하지 않았다면 대체 키로 사용합니다. 기존 키 자체는 수정·삭제하지 않습니다.
  - 설정의 "그만 사용" 은 이 사이트에서 대체 키 사용을 끄는 로컬 플래그만 설정합니다.
- **PAT를 공유하지 마세요.** 채팅, 스크린샷, 이슈, 커밋, URL, 코드에 넣지 않습니다. 저장소에는 어떤 토큰도 커밋하지 않습니다.
- 키가 노출됐다면 GitHub에서 즉시 폐기(revoke)하고 새로 발급합니다.

쓰기는 최신 원격 상태를 다시 읽은 뒤 해당 항목 하나만 병합하고, 변경된 SHA 로 저장합니다. 충돌(409) 시 한 번 다시 읽어 재시도하며, 다른 사람의 무관한 변경을 덮어쓰지 않습니다. 저장에 실패하면 기존 로컬 상태를 유지하고 오류를 표시합니다.

### `watchlist-data` 브랜치 준비

동기화는 `watchlist-data` 브랜치의 `docs/data/user-state.json` 을 읽고 씁니다.
**브랜치가 없으면 저장이 준비된 것으로 간주하지 않습니다.** 최초 1회, `main` 에서 `watchlist-data` 브랜치를 만들고 빈 상태 파일을 커밋해 두세요.

```json
{
  "version": 1,
  "favorites": {},
  "deleted": {}
}
```

`main` 의 같은 경로 파일은 기본 상태로 유지합니다. 상태 저장은 `watchlist-data` 에만 일어나며, 이 브랜치의 커밋은 Pages 배포를 트리거하지 않습니다. 사이트 배포는 `main` 푸시 또는 수동 실행으로만 이루어집니다.

## 검증과 배포

```bash
# 데이터 검증 (review-core 의 normalizeCatalog / normalizeState 사용)
node scripts/validate-catalog.cjs

# 단위 테스트
node --test tests/*.cjs
```

`.github/workflows/pages.yml` 은 `main` 푸시와 수동 실행에서만 동작합니다.

1. `node scripts/validate-catalog.cjs`
2. `node --test tests/*.cjs`
3. `docs/` 를 Pages 아티팩트로 업로드
4. 공식 `actions/deploy-pages` 로 배포 (`pages: write`, `id-token: write`, `github-pages` environment)

저장소 Settings → Pages 에서 배포 소스를 **GitHub Actions** 로 설정해야 합니다.
`watchlist-data` 브랜치의 상태 커밋은 배포를 유발하지 않습니다.
