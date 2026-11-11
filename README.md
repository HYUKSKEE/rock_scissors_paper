# ✌️ 가위바위보 경품 게임

링크로 공유하는 가위바위보 경품 게임 웹앱입니다.
생성자가 게임을 만들고 링크를 공유 → 참가자들이 컴퓨터와 가위바위보 → 생성자가 종료하면 **승률 높은 순서대로 상위 N명**이 기프티콘 이미지를 받습니다.

- 프론트엔드: Vite + React + TypeScript, React Router, Tailwind CSS v4, React Three Fiber + drei
- 백엔드: **직접 만든 서버 없음.** Supabase(Anonymous Auth, Postgres + RLS + RPC, Storage, Realtime)만 사용
- 배포: Vercel (무료 플랜 범위)

---

## 게임 규칙

### 명세에 있던 규칙
1. 생성자는 제목, 당첨 인원 N(1~10), 1인당 판수 R(기본 5, 3~10)을 정하고 순위별 기프티콘 이미지 N장을 올립니다. (1등 → 이미지1 …)
2. 참가자는 닉네임을 입력하고 컴퓨터와 R판을 합니다. **비기면 판수에 포함하지 않고 다시** 합니다.
   컴퓨터의 선택·승패 판정·전적 기록은 **전부 서버(Postgres 함수 `play_round`)** 에서 합니다. 클라이언트는 자기 선택만 보냅니다.
3. 순위: **승률(wins / R) 내림차순 → 동률이면 참여 시각(`joined_at`) 오름차순**. R판을 모두 끝낸 사람만 순위에 들어갑니다.
4. 게임 종료는 관리 링크(admin_token)를 가진 생성자만 할 수 있고, 종료 시 서버가 상위 N명을 당첨자로 확정해 저장합니다. 종료 후 참여·플레이는 불가능합니다.
5. 결과 페이지에서는 누구나 당첨자 닉네임/순위를 볼 수 있고, 기프티콘 이미지는 **해당 순위 당첨자 본인(같은 익명 uid)** 만 볼 수 있습니다.

### 모호해서 제가 정한 규칙
| 상황 | 정한 규칙 |
|---|---|
| 승률 비교 | 한 게임 안에서 R은 모두 같으므로 `wins`가 같으면 승률이 같습니다. 서버는 `wins / R` 로 정렬합니다. |
| 0승이어도 R판을 끝냈다면? | 순위에 들어가며, 당첨 인원이 남으면 당첨됩니다(최소 승수 조건 없음). |
| 종료 시 완주자가 N명보다 적으면? | 있는 만큼만 당첨됩니다. (결과 화면에 "당첨자 없음"도 표시) |
| 아직 R판을 끝내지 못한 사람 | 종료 시 순위에서 제외됩니다. 순위표에는 "진행 중"으로 따로 보여줍니다. |
| 같은 uid가 `join_game`을 다시 호출 | 에러 없이 **기존 참가자를 그대로 반환**합니다(닉네임 변경 불가). 새로고침해도 이어서 플레이할 수 있습니다. |
| 닉네임 | 앞뒤 공백을 제거한 1~12자. 한 게임 안에서 **대소문자 구분 없이 중복 불가**(`NICKNAME_TAKEN`). |
| 한 사람이 여러 번 참여 | 익명 uid는 브라우저(저장소)당 하나이므로, 시크릿 창이나 다른 브라우저로 다시 들어오면 새 참가자가 될 수 있습니다. 익명 로그인 기반이라 막을 수 없는 한계입니다. |
| 종료 호출 | 여러 번 호출해도 안전합니다(멱등). 이미 확정된 결과는 바뀌지 않습니다. |
| 비김 기록 | `rounds` 테이블에는 기록하지만 `played`/`wins`에는 반영하지 않습니다. |
| 제목 길이 | 1~50자 |
| 게임 종료 후 접속 | `/g/:id` 로 들어오면 자동으로 `/g/:id/result` 로 이동합니다. |
| 이미지 | jpg / png / webp, 5MB 이하, 당첨 인원 수만큼 **모두** 선택해야 게임을 만들 수 있습니다. |

---

## 폴더 구조

```
supabase/migrations/
  20260101000000_schema.sql     테이블 · 공개용 뷰 · RLS · 권한 · Realtime
  20260101000100_functions.sql  RPC (create_game, join_game, play_round, close_game, verify_admin, set_prize_paths)
  20260101000200_storage.sql    비공개 버킷 `prizes` + Storage 정책
  20260101000300_storage_creator_select.sql  생성자 업로드(INSERT…RETURNING)용 SELECT 정책 (open 상태에서만)
src/
  lib/       supabase 클라이언트(익명 로그인), RPC 래퍼, 순위 로직, 에러 메시지
  hooks/     세션, 게임/참가자(Realtime) 훅
  components/ 캔디 버튼, 3D 손(Hand3D), 순위표, 모달 …
  pages/     Home, Create, Game, Admin, Result
tests/       db.test.ts(실제 Postgres 규칙 검증), rank.test.ts
```

## 보안 설계 요약
- 모든 테이블 RLS ON + 클라이언트의 INSERT/UPDATE/DELETE 권한 회수. **쓰기는 `security definer` RPC로만** 가능합니다.
- `games` 테이블은 클라이언트가 직접 읽을 수 없고, `admin_token_hash`·`creator_uid`를 뺀 뷰 `games_public`만 공개합니다.
- `admin_token`은 서버에서 랜덤 생성(24바이트) 후 **SHA-256 해시만 저장**합니다. 토큰은 생성 응답에서 단 한 번만 내려갑니다.
- `players`, `winners`는 공개 읽기(닉네임·전적). `rounds`는 본인 것만 읽을 수 있습니다.
- 기프티콘 이미지: 비공개 버킷. 업로드는 게임 생성자(uid)만, 읽기는 `winners`에 `(game_id, prize_path, uid = 나)`가 있을 때만 허용됩니다. 클라이언트는 `createSignedUrl`(10분)로 엽니다.
- `service_role` 키는 프론트에 쓰지 않습니다. `anon` 키만 사용합니다.
- 참고: `players.uid`/`winners.uid`가 공개 읽기이므로 익명 uid 값은 노출됩니다. uid만으로는 다른 사람으로 행동할 수 없습니다(JWT 필요).

---

## 시작하기

### 1. Supabase 프로젝트 만들기
1. <https://supabase.com> 에서 로그인 → **New project** (Free 플랜).
2. 프로젝트가 만들어지면 **Project Settings → API** 에서 `Project URL`과 `anon public` 키를 확인해 둡니다.

### 2. 익명 로그인 켜기
**Authentication → Sign In / Providers**(또는 *Providers*) → **Anonymous Sign-Ins** 를 **Enable**.

> ⚠️ 익명 로그인은 IP당 시간당 요청 제한이 있습니다(기본 30회/시간). 같은 와이파이에서 많은 사람이 동시에 접속하면 걸릴 수 있으니, 필요하면 **Authentication → Rate Limits** 에서 늘려주세요.

### 3. SQL 실행
**SQL Editor → New query** 에 아래 파일 내용을 **순서대로** 붙여넣고 각각 Run 합니다.

1. `supabase/migrations/20260101000000_schema.sql`
2. `supabase/migrations/20260101000100_functions.sql`
3. `supabase/migrations/20260101000200_storage.sql`
4. `supabase/migrations/20260101000300_storage_creator_select.sql`

(Supabase CLI를 쓴다면 `supabase link --project-ref <ref>` 후 `supabase db push` 로 한 번에 적용할 수도 있습니다.)

확인: **Storage** 에 비공개 버킷 `prizes`가 생겼고, **Database → Replication** 에서 `players` 테이블이 `supabase_realtime` 발행에 포함되어 있으면 됩니다.

### 4. 환경변수 설정
```bash
cp .env.example .env
```
`.env` 에 값을 채웁니다.
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # anon public 키
```

### 5. 로컬 실행
```bash
npm install
npm run dev        # http://localhost:5173
```
모바일에서 확인하려면 `npm run dev -- --host` 후 같은 네트워크의 폰으로 접속하세요.

### 6. Vercel 배포
1. GitHub에 push → <https://vercel.com> → **Add New → Project** 에서 저장소 import (Framework: Vite 자동 감지).
2. **Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 를 추가 (필요하면 `VITE_SITE_URL` 도).
3. **Deploy.** `vercel.json` 의 SPA 리라이트 덕분에 `/g/…` 링크로 바로 들어와도 동작합니다.
4. (권장) Supabase **Authentication → URL Configuration** 의 *Site URL* 에 배포 주소를 넣어둡니다.

### 링크 미리보기(OG)
`index.html` 의 OG 태그(제목·설명·`public/og.png`)가 카톡 등에서 미리보기로 보입니다. 이미지는 절대 URL이어야 하므로 빌드 때 `VITE_SITE_URL`(Vercel에서는 `VERCEL_PROJECT_PRODUCTION_URL`)로 채워집니다.
SPA라서 **게임마다 다른 제목의 미리보기는 불가능**하고 서비스 공통 미리보기가 나갑니다. (게임별 미리보기는 서버/Edge 렌더링이 필요해서 "서버 코드 없음" 조건상 제외했습니다.) 이미지는 `node scripts/make-og.mjs` 로 다시 만들거나 직접 교체하세요.

---

## 사용 흐름
| 경로 | 설명 |
|---|---|
| `/` | 소개, "게임 만들기", 이 기기에서 만든 게임 목록 |
| `/create` | 게임 설정 + 이미지 N장 업로드 → 공유 링크 / **관리 링크** 복사 |
| `/g/:id` | 닉네임 → 3D 가위바위보 → 내 전적 + 실시간 순위 |
| `/g/:id/admin#token=…` | 참가자 수, 실시간 순위, 게임 종료(확인 모달) |
| `/g/:id/result` | 당첨자 발표 + 컨페티, 당첨자 본인에게만 기프티콘 |

**관리 링크를 잃어버리면 게임을 종료할 수 없습니다.** 생성 시 이 기기의 localStorage에도 저장되지만, 다른 기기에서 관리하려면 관리 링크가 필요합니다.

## 무료 플랜 관련 주의
- Supabase 무료 프로젝트는 **일주일 동안 요청이 없으면 일시정지**됩니다. 연결 실패 시 앱은 "서버가 잠시 쉬고 있어요" 화면을 보여줍니다. 대시보드에서 **Restore** 하면 다시 살아납니다.
- 3D는 홈과 플레이 화면에만 쓰고(코드 분할로 필요한 페이지에서만 로드), 나머지는 CSS로 입체감을 냈습니다.

---

## 테스트
```bash
npm test          # vitest
npm run typecheck
```
- `tests/db.test.ts` — **PGlite(WASM 실제 Postgres)에 `supabase/migrations/*.sql`을 그대로 적용**해 DB 규칙을 검증합니다. (Supabase의 `auth.uid()`, 역할, storage 스키마는 최소한으로 흉내 냄)
  - 클라이언트 직접 쓰기 차단(RLS/권한), `admin_token_hash` 비노출, 토큰은 해시로만 저장
  - 입력 검증, 닉네임 규칙, uid당 1명
  - `play_round`: 서버 판정이 규칙과 일치, 비김은 판수 제외, **R판에서 정확히 종료 / 초과 호출 거부**
  - `close_game`: **승률 → 참여 순 정렬**, 미완주자 제외, 상위 N명 확정, 잘못된 토큰 거부, **멱등성**, 종료 후 참여·플레이 불가
  - 기프티콘: 생성자만 업로드, **해당 순위 당첨자 본인만 이미지 조회**
- `tests/rank.test.ts` — 화면의 순위표가 쓰는 `rankPlayers`(승률, 동률 시 참여 순, 미완주 제외).

> 한계: PGlite는 단일 연결이라 "진짜 동시 요청" 경합은 재현하지 못합니다. `play_round`는 플레이어 행에 `FOR UPDATE` 잠금을 걸어 직렬화하도록 작성했습니다. Realtime과 Storage 서비스 자체(Supabase 쪽 구현)는 실제 프로젝트에서 확인이 필요합니다.
