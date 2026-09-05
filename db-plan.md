# My Way — 데이터베이스 계획

작성 2026-08-19. 현재는 DB 없이 브라우저 localStorage만 쓰는 상태에서,
Supabase(Postgres)로 옮기기 위한 설계와 단계별 이행 계획.

## 확정된 방향

| 항목 | 결정 |
|---|---|
| 인프라 | Supabase (관리형 Postgres) — **단, 아래 국내 처리 제약 확인 필요** |
| 진입 경로 | 항상 토스 앱 내부 (`intoss://{appName}`) — 별도 회원가입 체계 없음 |
| 자유서술 원문 | 서버 저장하되 암호화 + 보관기간 설정 |
| AI허브 데이터 | **사용한다. 국외 반출이 없도록 국내에서만 처리** (2026-08-30) |

### ⚠ AI허브 사용 결정이 인프라 선택에 미치는 영향

`career_content_v1.json`의 `licensing.obligations`가 이렇게 못박고 있다.

```
"AI허브 데이터 국외 반출 금지 — 해외 LLM API 학습·추론 불가"
"AI허브 데이터 제3자 제공 금지"
"AI허브 데이터 사용 시 NIA 출처 표시 (앱 내)"
```

이 결정으로 아래가 **재검토 대상**이 된다. 확정 전에 §7의 확인 항목을 먼저 닫아야 한다.

| 항목 | 쟁점 |
|---|---|
| Supabase 리전 | 서울(ap-northeast-2)로 강제해야 한다. 기본값으로 두면 해외 리전에 앉을 수 있다 |
| Supabase 사업자 | 물리적 위치가 국내여도 운영 주체가 해외면 개인정보 국외이전 검토가 별도로 필요하다 |
| LLM 선택지 | 해외 API 사용 불가. 국내 사업자 또는 자체 호스팅으로 좁혀진다 |
| 백업·로그 저장소 | 리전이 해외로 새지 않는지 확인해야 한다 |

**주의 — 무엇이 "AI허브 데이터"인가.** 사용자가 입력한 자유 서술은 AI허브 데이터가 아니다.
제약이 걸리는 건 (1) AI허브로 학습한 **모델**, (2) 프롬프트에 심는 AI허브 **예시·라벨 기준**,
(3) 그것으로 만든 파생물이다. 다만 사용자 서술도 §2.8과 개인정보 국외이전 규정 때문에
어차피 국외로 보내지 않는 편이 안전하다.


---

## 0. 플랫폼이 제공하는 것과 제공하지 않는 것

토스인앱은 **일반 데이터베이스를 제공하지 않는다.** 공식 문서가 안내하는 선택지는
Supabase 연동, Firebase 연동, 자체 서버 DB 셋뿐이다.

| 플랫폼 기능 | 실체 | DB 대체 가능? |
|---|---|---|
| `Storage` | 기기 로컬 저장소. **문자열만** 저장 | ✗ 기기 교체 시 소실 |
| 데이터 SDK (`User.getConsentedData`) | 동의 기반 사용자 정보 **조회** | ✗ 쓰기 불가, 우리 데이터 아님 |
| Supabase / Firebase 연동 | 외부 DB를 직접 연결 | ○ 이 경로로 간다 |

`Storage`가 문자열만 받는 건 현재 구조와 잘 맞는다. 지금도 `JSON.stringify`한 값을
통째로 넣고 있어서, Phase 1 전환 시 직렬화 로직을 바꿀 필요가 없다.

---

## 1. 사용자 식별 — 먼저 풀어야 할 문제

### 1-0. 진입 경로는 제한되지만, API 엔드포인트는 공개다

미니앱은 토스 앱 안에서만 열린다. 홈·미니앱 상세·주요 기능으로 진입하고,
이동은 `intoss://{appName}` 전용 스킴을 쓴다. 출시 전 테스트도 QR로 생성된
테스트 스킴으로만 가능하다. 토스 밖에서 바로 들어오는 공개 진입점은 없다.

여기서 구분해야 할 것이 있다. 제한되는 건 **사용자가 화면에 도달하는 경로**이고,
그 화면이 호출하는 **서버·Supabase 엔드포인트는 그냥 공개 HTTPS 주소**다.

```
[제한됨]  사용자 → 토스 앱 → intoss://my-way → 미니앱 웹뷰
[열려있음] 웹뷰의 JS가 호출하는 https://xxx.supabase.co/rest/v1/...
           └ 프록시로 URL과 publishable key가 그대로 노출됨
           └ curl 로 어디서든 동일 요청 재현 가능
```

미니앱은 웹뷰에서 도는 웹 번들이라, 코드도 요청도 사용자 기기에서 다 보인다.
publishable key는 이름 그대로 공개용이라 비밀이 아니고, 그래서 공식 문서도
**RLS를 유일한 방어선으로** 강조한다.

즉 진입 경로 제한은 무심코 흘러드는 트래픽을 줄여주긴 하지만,
작정한 사람에 대한 방어가 되지는 않는다. 데이터 등급이 낮으면 충분하고,
심리 관련 자유서술이면 부족하다.

### 1-1. 공식 가이드 방식과 그 한계

앱인토스 Supabase 연동 가이드는 **서버 없이** 이렇게 하라고 안내한다.

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

```ts
const supabase = createClient(supabaseUrl, supabasePublishableKey)
```

- 배포 전 Table Editor → RLS 탭에서 RLS 활성화
- 정책은 인증된 사용자만 접근 가능하도록 설정
- Authentication → URL Configuration 에서 허용 도메인(Origin) 제한
- `.env`는 `.gitignore`에 반드시 추가

사용자 구분은 게임이면 `getUserKeyForGame`, 그 외에는 `getAnonymousKey`가 주는
해시를 쓰라고 안내한다.

**이 방식은 데이터 등급이 낮을 때 맞다.** 설정·기록·점수 같은 값이면 충분하고,
서버를 안 띄워도 되니 가장 빠르다.

다만 우리 데이터에는 두 가지가 걸린다.

1. **해시는 클라이언트가 주는 값이다.** `getAnonymousKey()`는 해시를 클라이언트에
   돌려주고, 그걸 그대로 컬럼에 넣는 구조다. 서명이 없어 서버가 진위를 확인할 수
   없다. 남의 해시를 아는 사람이 그 행을 조회·수정할 수 있다(IDOR).
   RLS가 `user_hash = <요청이 주장하는 해시>` 형태면 정책이 아무것도 막지 못한다.
2. **Origin 제한은 브라우저 밖에서 무력하다.** Origin 헤더는 curl에서 임의로 넣을 수 있다.

추가로 `getAnonymousKey`는 토스 앱 5.232.0 이상에서만 동작한다.
미지원 버전에서는 `undefined`, 실패 시 `'ERROR'`를 반환하고,
브라우저 개발 환경에는 아예 없다. 폴백 경로가 필요하다.

**판단: 익명키는 기기 로컬 캐시의 키로 쓰고, 심리 데이터를 담는 행의 소유자
식별에는 검증된 값을 쓴다.** 공식 가이드를 부정하는 게 아니라, 데이터 등급이
가이드가 상정한 것보다 높기 때문이다.

### 1-2. 검증 가능한 경로

토스 로그인 코드 교환만이 서버가 신뢰할 수 있는 신원을 만든다.

```
클라이언트  TossAuth.login()
              └→ { authorizationCode, referrer }     ※ 10분 유효, 1회용, 재사용 시 실패
                   ↓ (서버로 전달)
서버        POST https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token
              body: { authorizationCode, referrer }
              └→ { accessToken, refreshToken, expiresIn, tokenType: "Bearer" }
                   ↓
            GET  /api-partner/v1/apps-in-toss/user/oauth2/login-me
              header: Authorization: Bearer ${accessToken}
              └→ { userKey, agreedTerms, 암호화된 개인정보 필드 }
                   ↓
            userKey 를 DB의 사용자 식별자로 사용
```

**⚠ 서버↔토스 통신에는 mTLS 클라이언트 인증서가 필요하다.**
이게 인프라 선택에 직접 영향을 준다 — 아래 1-4 참고.

### 1-3. 권장 설계 — 저장 시점에만 신원을 요구

검사 시작부터 로그인을 강제하면 이탈이 크다. 저장이 필요한 순간에만 신원을 확보한다.

```
검사 진행 (문항 12개 + 정보수집)   → 기기에만 저장 (Storage), 서버 통신 없음
        ↓
결과 저장 / 명함 생성 / 다른 기기에서 이어보기를 원할 때
        ↓
TossAuth.login → 서버 코드 교환 → userKey 확보
        ↓
기기에 쌓인 데이터를 그 userKey로 업로드 (1회 병합)
        ↓
이후부터는 서버가 원본, 기기는 캐시
```

로그인을 거부하면 그대로 로컬 전용 모드로 계속 쓸 수 있게 둔다.
검사·명함 기능 자체는 서버 없이도 동작하므로 기능 손실이 없다.

### 1-4. 자체 서버는 선택이 아니라 필수 (확정)

앱인토스 서버 API는 **파트너사 서버에서 호출할 때 mTLS가 필수**다.
그리고 Supabase 연동 문서는 WebView의 클라이언트 연동만 다루며,
Edge Functions에서 클라이언트 인증서를 붙여 mTLS로 나가는 경로는 안내하지 않는다.
토스 문서가 명시하는 건 **자체 서버 + mTLS 구성**이다.

따라서 "Supabase만으로 끝내기"는 선택지에서 빠진다. 구조는 이렇게 굳는다.

```
                      ┌─ 인증: mTLS 로 토스 파트너 API 호출
[미니앱] ──────────> [자체 서버] ─┤
   │                              └─ AI: LLM API 키 은닉
   │                     │
   │                     └─ 검증된 userKey → Supabase용 JWT 서명 발급
   │                                    ↓
   └──JWT 첨부──> [Supabase PostgREST] ──RLS──> [Postgres]
```

서버가 맡는 일은 셋이다.

| 엔드포인트 | 역할 |
|---|---|
| `POST /auth/toss` | authorizationCode 교환 → userKey → JWT 발급 |
| `POST /auth/refresh` | 토큰 갱신 |
| `POST /ai/*` | LLM 호출 (API 키를 클라이언트에서 제거) |

### 1-5. 서버가 생기면서 따라오는 설계 변화

앞서 익명키 방식이 매력적이었던 이유는 "서버를 안 띄워도 된다"였다.
그 전제가 사라졌으므로, 더 안전한 쪽으로 옮기는 비용이 사실상 0이 된다.

**민감 데이터의 쓰기는 클라이언트 직결 대신 서버를 경유시킨다.**

| 경로 | 대상 | 인증 |
|---|---|---|
| 미니앱 → 서버 → Postgres | 자유서술, 대화 원문, 검사 결과 | 서버가 `service_role`로 처리 |
| 미니앱 → Supabase 직결 | 명함 정보, 테마, 완료 여부 등 저민감 | JWT + RLS |

이렇게 하면 1-1에서 지적한 익명키 위조 문제가 구조적으로 사라진다.
클라이언트가 소유자를 주장할 여지 자체가 없어지기 때문이다.
RLS는 유일한 방어선이 아니라 **이중 방어**로 격하되며, 그래도 반드시 켜 둔다.

암호화 키를 서버에만 두면 되는 것도 부수적 이득이다(3절 참고).

---

## 2. 스키마 초안 (Postgres)

```sql
-- 사용자. toss_user_key 는 login-me 로 검증된 값만 들어온다.
create table app_user (
  id            uuid primary key default gen_random_uuid(),
  toss_user_key text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  deleted_at    timestamptz              -- 탈퇴 요청 시각
);

-- 검사 1회 = 세션 1행. 재검사해도 기존 행을 지우지 않는다.
create table survey_session (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references app_user(id) on delete cascade,
  instrument_version text not null,       -- 예: 'fromai-scl-v1'
  status             text not null,       -- in_progress | completed | abandoned
  started_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index on survey_session (user_id, started_at desc);

-- 문항 응답. 자유서술이라 암호문으로만 저장한다.
create table survey_answer (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references survey_session(id) on delete cascade,
  item_id      text not null,             -- 'q01' ...
  answer_enc   bytea not null,            -- AES-GCM 암호문
  answer_iv    bytea not null,
  key_version  smallint not null,         -- 키 회전 대비
  created_at   timestamptz not null default now(),
  unique (session_id, item_id)
);

-- 채점 결과. 수치라서 평문 저장 가능.
create table survey_result (
  session_id    uuid primary key references survey_session(id) on delete cascade,
  score         smallint not null check (score between 0 and 100),
  level         text not null,            -- low | moderate | high
  dimensions    jsonb not null,           -- [{dimension, score}, ...]
  summary       text,
  keywords      text[],
  scorer_version text not null,           -- 'local-rule-v1' | 'llm-2026xx'
  created_at    timestamptz not null default now()
);

-- 정보수집. 사용자당 1행, 최신값 유지.
create table collected_info (
  user_id             uuid primary key references app_user(id) on delete cascade,
  desired_career_enc  bytea,
  strengths_enc       bytea,
  hobbies_enc         bytea,
  iv                  bytea,
  key_version         smallint,
  updated_at          timestamptz not null default now()
);

-- 대화 로그. 저장 범위는 동의 항목에 따라 조절.
create table chat_message (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references survey_session(id) on delete cascade,
  role        text not null,              -- ai | user
  kind        text not null,              -- survey | collect | free
  content_enc bytea not null,
  iv          bytea not null,
  key_version smallint not null,
  created_at  timestamptz not null default now()
);
create index on chat_message (session_id, created_at);

-- 생성한 명함. 이미지는 저장하지 않고 재생성한다.
create table card (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user(id) on delete cascade,
  title      text,
  tags       text[],
  tagline    text,
  theme_id   text not null,
  created_at timestamptz not null default now()
);

-- 동의 이력. 민감정보 처리 근거가 된다.
create table consent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_user(id) on delete cascade,
  type       text not null,               -- sensitive_data | retention | ai_processing
  version    text not null,               -- 약관 버전
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

### 현재 구조 대비 달라지는 점

| 지금 (localStorage) | DB 이후 |
|---|---|
| 결과 1개만 보관, 재검사하면 덮어씀 | 세션마다 행이 남아 **이력 비교 가능** |
| 기기 바꾸면 소실 | 기기 무관하게 이어짐 |
| 대화 내용 저장 안 함 | 세션에 묶여 보관 (동의 시) |
| 삭제 = 키 하나 제거 | 삭제 요청 · 보관기간 만료 처리 필요 |

재검사 이력이 쌓이면 "3개월 전 대비 진로불안 -12점" 같은 화면을 만들 수 있다.
이건 현재 구조로는 불가능하고, DB로 옮기는 가장 큰 실익이다.

---

## 3. 암호화

자유서술 응답과 대화 내용은 **애플리케이션 레벨에서 암호화**한 뒤 저장한다.
DB 안에서 암복호화(pgcrypto)하면 키가 DB 접근권한과 함께 노출되므로 피한다.

```
평문 ──AES-256-GCM──> {ciphertext, iv} ──> Postgres bytea
           ↑
    데이터 키 (KMS/Secrets Manager 보관, DB 밖)
```

- `key_version` 컬럼으로 키 회전에 대비한다.
- 검색이 필요한 필드는 암호화하지 않는다. 현재 설계에서 검색 대상은 수치뿐이라 문제 없다.
- Supabase 접근 시 RLS와 별개로, **service_role 키는 서버에만** 두고 클라이언트에 노출하지 않는다.

### RLS

Supabase를 클라이언트에서 직접 호출한다면 RLS가 유일한 방어선이다.
공식 가이드도 배포 전 RLS 활성화와 Origin 제한을 필수로 안내한다.

```sql
alter table survey_session enable row level security;

create policy "own rows" on survey_session
  for all using (
    user_id = (select id from app_user where toss_user_key = auth.jwt() ->> 'sub')
  );
```

핵심은 `auth.jwt()`의 `sub`가 **검증된 userKey**여야 한다는 점이다.
익명키를 그대로 넣으면 정책 문장은 그럴듯해도 실제로는 아무것도 막지 못한다(1-1 참고).

RLS 정책을 쓸 때 흔히 하는 실수 두 가지:

```sql
-- ✗ 요청이 주장하는 값을 그대로 믿는다. 위조 가능.
create policy "bad" on survey_session
  for all using (user_hash = current_setting('request.header.x-user-hash'));

-- ✗ "로그인만 했으면 통과". 남의 행까지 다 보인다.
create policy "bad2" on survey_session
  for all using (auth.role() = 'authenticated');
```

정책은 반드시 **서버가 서명한 JWT의 클레임**과 행의 소유자를 비교해야 한다.

### 설정 관리

```
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx
```

- `.env`는 `.gitignore`에 추가한다. (현재 프로젝트에는 `.env`가 아직 없다)
- publishable key는 공개되어도 되는 값이다. **비밀이 아니므로 이것에 보안을 기대면 안 된다.**
- `service_role` 키는 절대 클라이언트 번들에 넣지 않는다. 서버 전용이다.
- Authentication → URL Configuration에서 허용 Origin을 제한한다.
  브라우저발 요청은 걸러지지만 curl은 못 막으므로, RLS를 대체하지 않는 보조 수단으로 본다.

---

## 4. 보관기간과 삭제

| 데이터 | 보관 | 근거 |
|---|---|---|
| 자유서술 응답 · 대화 원문 | 1년 | 재검사 비교와 LLM 재분석에 필요한 최소 기간 |
| 검사 점수 · 차원 결과 | 3년 | 장기 추이 제공. 개인 식별력이 낮음 |
| 정보수집 (진로·특기·취미) | 탈퇴 시까지 | 명함 재생성에 계속 쓰임 |
| 동의 이력 | 법정 기간 | 처리 근거 증빙 |

```sql
-- pg_cron 예시: 만료된 자유서술 제거
select cron.schedule('purge-answers', '0 4 * * *', $$
  delete from survey_answer
   where created_at < now() - interval '1 year';
$$);
```

- 탈퇴 요청 시 `app_user.deleted_at` 표시 후 30일 내 하드 삭제. `on delete cascade`로 하위 행이 함께 지워진다.
- 앱 안에 "내 데이터 삭제" 경로를 반드시 노출한다. 지금의 "전체 초기화" 버튼이 서버 삭제까지 호출하도록 확장하면 된다.

### 민감정보 판단이 선행되어야 한다

진로불안 수치와 심리 관련 자유서술은 개인정보보호법상 **민감정보에 해당할 소지**가 있다.
해당한다면 일반 동의와 분리된 별도 동의가 필요하고, 토스 콘솔 심사에서도 확인 대상이 된다.
스키마보다 이 판단이 먼저다. 법무 검토 결과에 따라 `consent` 테이블의 항목 구성이 달라진다.

---

## 5. 이행 단계

### Phase 0 — 현재
localStorage. 서버·DB 없음. 기능 검증 단계.

### Phase 1 — 저장소 교체 (서버 없이)
`localStorage` → 플랫폼 `Storage` API로 교체.
토스 앱 웹뷰 캐시 삭제에 덜 취약해지고, 미니앱 표준 경로를 따르게 된다.
바꿀 지점은 [AppStore.tsx](my-way/src/store/AppStore.tsx)의 `load()`와 저장 `useEffect` **두 곳**뿐이다.
`Storage`는 비동기라 `load()`가 Promise가 되므로, 초기 로딩 상태 처리만 추가된다.

### Phase 2 — 자체 서버 + Supabase
1. 토스 콘솔에서 mTLS 인증서 발급 (파트너 API 사용 전제)
2. Supabase 프로젝트 생성, 위 스키마 마이그레이션 적용
3. 자체 서버 구축 — `/auth/toss`, `/auth/refresh` (mTLS로 토스 파트너 API 호출)
4. 민감 데이터 쓰기 경로를 서버 경유로 구현 (1-5 참고)
5. 기기에 쌓인 데이터 1회 업로드(병합) 경로 구현
6. RLS 정책 적용 및 검증 (이중 방어)

공식 Supabase 연동 가이드의 클라이언트 설정(`createClient` + publishable key + RLS +
Origin 제한)은 저민감 데이터 경로에 그대로 쓴다. 가이드와 달라지는 건
**민감 데이터를 서버 경유로 돌리고 사용자 식별을 검증된 userKey로 바꾸는 것** 둘이다.

인증서 발급이나 서버 구축이 늦어지면, 그 전까지는 토스 로그인 자체가 불가능하므로
**서버 저장 없이 Phase 1 상태(기기 로컬)로 운영한다.** 검사·결과·명함 모두
로컬만으로 동작하도록 만들어 두었기 때문에 기능 손실은 없고, 기기 간 이어보기만 빠진다.

### Phase 3 — 서버 원본화
- 로컬은 캐시로 격하, 서버가 원본
- 재검사 이력 조회 화면 추가
- LLM 연동을 같은 서버에 얹어 API 키를 클라이언트에서 제거

코드 상으로는 Phase 2에서도 [api/careerApi.ts](my-way/src/api/careerApi.ts)의 주석 처리된
`request(...)` 호출을 되살리고 `VITE_API_BASE_URL`을 채우는 게 전부다.
화면 코드는 손댈 필요가 없도록 이미 분리해 두었다.

---

## 6. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| mTLS 인증서 발급 지연 | Phase 2 전체가 막힘 | 가장 먼저 착수. 그동안은 Phase 1 로컬 운영 |
| 서버 운영 부담 (배포·모니터링·가용성) | 서버가 죽으면 로그인·AI 불가 | 서버 장애 시 로컬 모드로 degrade 되도록 설계 |
| 익명키를 신원으로 오용 | 타인의 검사 결과 조회·변조 | 민감 데이터는 서버 경유. 식별자는 검증된 userKey |
| "진입 경로가 토스뿐"에 기댄 방어 | API는 공개라 curl로 우회 | RLS + 검증된 JWT. Origin 제한은 보조 수단 |
| publishable key 노출 | 정상 동작 (비밀 아님) | 이 키에 보안을 기대지 않는 설계. `service_role`은 서버 전용 |
| 심리 데이터의 민감정보 해당 | 별도 동의·심사 지연 | 스키마 확정 전 법무 검토 |
| `getAnonymousKey` 미지원 버전 | 5.232.0 미만에서 `undefined` | 로컬 전용 모드로 폴백 |
| authorizationCode 10분/1회용 | 교환 실패 시 재로그인 필요 | 서버에서 즉시 교환, 실패 시 재시도 UX |
| 로컬→서버 병합 중복 | 같은 검사가 두 번 저장 | 클라이언트가 세션 UUID를 생성해 멱등 업로드 |

---

## 7. 다음 확인 항목

계획을 실행에 옮기기 전에 답이 필요한 것들.

**해결됨**
- ~~토스인앱이 DB를 제공하는가~~ → 제공하지 않음. Supabase 확정
- ~~Supabase Edge Function으로 mTLS가 가능한가~~ → 문서에 없음. **자체 서버 + mTLS로 확정**

**남은 것 (순서대로 걸린다)**

1. **심리 데이터의 민감정보 해당 여부** (법무) — `consent` 구성과 심사 요건이 갈린다
2. **mTLS 인증서 발급 절차와 소요 기간** (토스 콘솔) — Phase 2 전체의 시작점
3. **서버 호스팅 결정 — 국내 리전 확정** — AI허브 사용 결정으로 제약이 붙었다
4. **LLM 선택** — 아래 후보 중 결정
5. **FROM.AI HUB 공식 문항 확보** — `instrument_version` 값과 문항 수가 확정되어야 스키마가 굳는다

### 국내 처리 체크리스트 (AI허브 사용 전제)

- [ ] Supabase 프로젝트를 **서울 리전**으로 생성 (기본값 확인 필수)
- [ ] Supabase 사업자 소재로 인한 개인정보 국외이전 검토 — 필요하면 국내 관리형 Postgres로 교체
- [ ] 자체 서버(mTLS·LLM)를 **국내 클라우드**에 배치
- [ ] 로그·백업·모니터링 저장소 리전 확인 (여기서 새는 경우가 많다)
- [ ] LLM 추론 경로가 국외로 나가지 않는지 확인
- [ ] **NIA 출처 표시를 앱 내에 노출** — AI허브 사용 시 의무. 모델 붙이는 시점에 함께 넣는다

> 표기 문구: "본 서비스는 과학기술정보통신부와 한국지능정보사회진흥원의
> 「지능정보산업 인프라 조성」 사업으로 구축된 AI 학습용 데이터를 활용하였습니다."

### LLM 후보 (국내 처리 가능한 것만)

| 방식 | 예 | 고려사항 |
|---|---|---|
| 국내 사업자 API | HyperCLOVA X, EXAONE, Solar 등 | 계약·리전을 문서로 확인. 가장 빠름 |
| 자체 호스팅 오픈모델 | 국내 GPU에 올려 운영 | 통제력 최상. 운영 부담과 비용이 큼 |
| 해외 LLM API | Claude, GPT 등 | **사용 불가.** `obligations` 위반 |

`decisions`의 "모델 학습 — 프롬프팅 우선, 학습은 부족분 확인 후" 는 유효하다.
프롬프팅 단계에서도 프롬프트에 AI허브 라벨 기준(`cues`)을 심으면 국외 반출에 해당하므로,
**프롬프팅이라고 해서 해외 API를 쓸 수 있는 건 아니다.**

1·2번은 외부 답변을 기다려야 하는 항목이라 지금 바로 착수하는 게 좋다.
그동안 코드 쪽에서는 Phase 1(`Storage` 전환)을 진행할 수 있다.
