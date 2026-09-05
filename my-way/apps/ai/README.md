# apps/ai — 로컬 추론 서버

EXAONE + 진로 LoRA 어댑터를 4bit로 올려 두고 **텍스트 생성만** 담당합니다.
프롬프트를 만들고 표현 규칙(CLAUDE.md §7)을 거르는 건 `apps/api` 쪽 일이에요.

## 띄우기

```cmd
cd /d C:\Users\dotbl\Downloads\TOSS_project
.venv\Scripts\python.exe my-way\apps\ai\server.py
```

모델 로딩에 **30초~1분**, VRAM **약 7GB**가 듭니다. 로딩이 끝나면:

```
2026-08-31 00:31:46 INFO 모델 로딩 완료 (34.0초)
```

확인:

```cmd
curl http://127.0.0.1:8000/health
```

```json
{"status":"up","ready":true,"model":"exaone_model",
 "adapter":"exaone_career_lora","device":"NVIDIA GeForce RTX 5060 Ti","error":null}
```

## 엔드포인트

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/health` | 로딩 상태 · 모델 · 어댑터 · 디바이스 |
| POST | `/complete` | `{system?, prompt, max_new_tokens, temperature, top_p}` → `{text, elapsed_ms}` |

## 환경변수

| 변수 | 기본값 |
|---|---|
| `AI_MODEL_PATH` | `<TOSS_project>/exaone_model` |
| `AI_ADAPTER_PATH` | `<TOSS_project>/exaone_career_lora` |
| `AI_HOST` | `127.0.0.1` |
| `AI_PORT` | `8000` |

어댑터 폴더가 없으면 베이스 모델로만 뜹니다(경고 로그).
`apps/api`는 `AI_BASE_URL`(기본 `http://127.0.0.1:8000`)로 이 서버를 찾습니다.

## 지켜야 하는 것

- **`127.0.0.1`에만 바인딩합니다.** AI허브 데이터로 학습한 모델이라 학습·추론 모두
  이 머신을 벗어나면 안 돼요. (PYTHON-MIGRATION.md §8 국외 반출)
- **프롬프트와 생성 결과를 로그에 남기지 않습니다.** 자유 서술에 실명·학교명이
  섞일 수 있어요. (CLAUDE.md §2.8) 로그에는 길이와 소요 시간만 남습니다.
- **생성은 한 번에 하나씩.** 8GB VRAM이라 동시 실행하면 공유메모리로 새면서
  급격히 느려집니다. 락으로 직렬화해요.

## 어댑터 스위치 — `use_adapter`

`/complete` 는 요청마다 LoRA 어댑터를 켜고 끌 수 있어요. PEFT 의 `disable_adapter()`
컨텍스트를 쓰므로 다음 요청에는 영향이 없습니다.

```
{"prompt": "...", "use_adapter": false}   → 베이스 모델로만 생성
```

응답의 `adapter_used` 로 실제 적용 여부를 확인할 수 있어요.
어댑터가 아예 없으면 요청과 무관하게 `false` 입니다.

## 지금은 두 트랙 다 어댑터를 끕니다 — 중요

`exaone_career_lora` 는 `제시어 → 학생 답변` 으로 학습돼서 **상담사가 아니라
학생을 흉내냅니다.** 되물을 질문을 만들어야 하는 자리에는 맞지 않아요.

같은 프롬프트로 잰 실측 히트율(`/api/ai/followup` 이 쓸 만한 질문을 돌려준 비율):

| 트랙 | 어댑터 켬 | 어댑터 끔(베이스) |
|---|---|---|
| teen | 1/10 | 5/5 |
| jobseeker | 1/10 | 10/10 |

어투도 베이스 쪽이 맞습니다. 프롬프트로 반말/해요체를 지시하면 그대로 따라와요.
어댑터를 켜면 지시와 무관하게 고등학생 반말로 새어나옵니다.

```
어댑터 ON   "아직까지는 없다"                                   (1.4초)
어댑터 OFF  "그럼 어떤 활동이나 취미를 할 때 자신감이 생기거나
             흥미를 느끼는 부분은 있어?"                          (3~5초)
```

그래서 `apps/api` 의 `PROFILES` 는 두 트랙 다 `useAdapter: false` 입니다.
**스위치는 남겨 뒀어요.** 아래처럼 다시 학습하면 트랙별로 켜면 됩니다.

### 개선하려면

원본 AI허브 데이터에는 **상담사 코멘트**(`comment.comment`, 100% 존재, 평균 56자),
**영역**(`meta.category_name`, 8종), **등급**(`comment.grade`, 상/중/하)이 들어 있는데
현재 학습은 셋 다 쓰지 않았습니다. 학습 타깃을
`(제시어 + 학생답변) → 상담사 코멘트`로 바꾸면 앱에 실제로 쓸 수 있는 모델이 나옵니다.

> 단, 상담사 코멘트는 평가적 문장이라 **그대로 화면에 띄우면 CLAUDE.md §7 위반**입니다.
> 내부 신호로 쓰거나 허용된 어투로 다시 써야 해요. `grade`도 §2.3에 따라 노출 금지입니다.
