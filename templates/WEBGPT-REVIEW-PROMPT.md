# 웹GPT 평가 요청 양식

아래 요청에서 게임명·기종을 바꿔 웹GPT에 전달하세요. 출력된 JSON을 `docs/data/games.json`의 `games` 배열에 추가하면 사이트가 평점순으로 자동 정렬합니다.

---

**[게임명] / [기종]을 한글패치로 플레이할지 판단할 수 있게 평가해줘.**

- 게임 자체의 완성도를 **10점 만점**으로 평가하고 점수 이유, 구체적인 장점·단점, 잘 맞는 취향을 스포일러 없이 정리해줘.
- 해당 기종의 리뷰와 실제 자료를 조사하고, 확인한 출처 URL을 넣어줘. 다른 기종의 평가를 그대로 옮기지 마.
- 직접 플레이했다고 꾸미거나, 유저 평균 점수·출처·패치 버전을 만들지 마. 자료 기반 편집 평가임을 밝혀줘.
- 점수는 숫자(예: `8.5`)로 적고, 근거가 부족하면 억지로 점수를 매기지 말고 `null`과 사유를 적어줘.
- 한글패치 대상 기종·판본·배포 페이지를 확인하고, 패치에 관한 주의점은 `patch.notes`에 따로 적어줘.
- 패치 페이지가 확인되면 `available`, 미확인이면 `unconfirmed`, 배포가 중단됐다면 `stopped`로 적어줘. `available`일 때만 실제 패치 배포 페이지 URL을 넣어줘.
- 확인하지 못한 선택 정보는 빈 문자열·빈 배열로 남겨줘. 게임 원본 파일 링크는 넣지 마.

**결과는 아래 구조의 JSON 객체 하나로 출력해줘.** 예시 내용은 실제 조사 결과로 바꾸고, 이미 등록된 게임의 ID는 유지해줘.

```json
{
  "id": "game-title-psp",
  "title": "게임 제목",
  "original": "원제",
  "platforms": ["psp"],
  "genres": ["ADV"],
  "score": null,
  "summary": "게임 소개와 점수 이유, 추천 취향. 자료 기반 평가임을 명시.",
  "pros": ["구체적인 장점"],
  "cons": ["구체적인 단점"],
  "sources": [{"label": "자료 이름", "url": "https://example.com/verified-source"}],
  "patch": {"status": "unconfirmed", "url": "", "notes": "패치 판본·확인 날짜·주의사항"},
  "reviewedAt": "YYYY-MM-DD",
  "reviewer": "WebGPT"
}
```

- `id`: 소문자 영문·숫자·하이픈, 최대 100자. 한 번 등록한 ID는 변경하지 않습니다.
- `score`: `0`~`10` 숫자 또는 미평가 `null`. 문자열 `"8.5"`는 사용하지 않습니다.
- `platforms`: `ps1`, `ps2`, `psp`, `psvita`, `ps3`, `ps4`, `ps5`, `dreamcast`, `ds`, `3ds`, `switch`, `pc`, `saturn`, `snes`, `gba`, `other` 중 선택합니다.
- `genres`: `ADV`, `RPG`, `ACT`, `SLG`, `SIM`, `PUZ` 등 장르 이름을 배열로 적습니다.
- `reviewedAt`: 실제 조사 날짜, 모르면 빈 문자열. 예시 날짜·URL은 그대로 제출하지 않습니다.
