/**
 * 커리어넷 Open API 클라이언트.
 *
 * **API 키는 이 프로세스 안에만 존재해요.** 프론트로 내보내지 마세요. (CLAUDE.md §2.1)
 * `SUCC_YN`이 `N`이면 `ERROR_REASON`을 서버 로그에만 남기고
 * 클라이언트에는 일반화된 메시지를 반환해요. (CLAUDE.md §4)
 */

const BASE = 'https://www.career.go.kr/inspct/openapi/test'

/** 화이트리스트. q를 그대로 통과시키면 우리 키로 아무 검사나 긁어갑니다. (CLAUDE.md §4) */
export const ALLOWED_TESTS = [6, 8, 24, 25, 35, 36] as const

export type AllowedTest = (typeof ALLOWED_TESTS)[number]

export function isAllowedTest(value: number): value is AllowedTest {
  return (ALLOWED_TESTS as readonly number[]).includes(value)
}

export class CareernetError extends Error {
  readonly reason: string

  constructor(message: string, reason: string) {
    super(message)
    this.name = 'CareernetError'
    this.reason = reason
  }
}

function apiKey(): string {
  const key = process.env.CAREERNET_API_KEY
  if (!key) throw new CareernetError('key missing', 'CAREERNET_API_KEY 미설정')
  return key
}

interface CareernetEnvelope {
  SUCC_YN?: string
  ERROR_REASON?: string
  RESULT?: unknown
}

function unwrap(payload: CareernetEnvelope): unknown {
  if (payload.SUCC_YN === 'N') {
    throw new CareernetError('careernet returned N', payload.ERROR_REASON ?? '(사유 없음)')
  }
  return payload.RESULT ?? payload
}

/** 문항 조회. 응답에 `relm`은 오지 않아요 — 영역별 계산 불가. (CLAUDE.md §0) */
export async function fetchQuestions(q: AllowedTest): Promise<unknown> {
  const url = `${BASE}/questions?apikey=${encodeURIComponent(apiKey())}&q=${q}`
  const res = await fetch(url)

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new CareernetError(
      'questions http error',
      `HTTP ${res.status}${detail ? ` / ${detail.slice(0, 300)}` : ''}`,
    )
  }

  return unwrap((await res.json()) as CareernetEnvelope)
}

export interface ReportInput {
  qestrnSeq: string
  trgetSe: string
  gender: string
  grade?: string
  name?: string
  school?: string
  email?: string
  startDtm: number
  answers: string
}

/**
 * 결과 생성. 응답은 `{ inspctSeq, url }` 뿐이고 점수 데이터는 없어요. (CLAUDE.md §0)
 *
 * 매뉴얼 예시는 `grade`·`name`·`school`·`email`을 **빈 문자열로라도 전부** 담고 있어요.
 * 키를 아예 빼고 보내면 500이 돌아옵니다. 여기서 기본값을 채워 항상 포함시켜요.
 */
export async function createReport(input: ReportInput): Promise<unknown> {
  const body = {
    apikey: apiKey(),
    qestrnSeq: input.qestrnSeq,
    trgetSe: input.trgetSe,
    gender: input.gender,
    grade: input.grade ?? '',
    name: input.name ?? '',
    school: input.school ?? '',
    email: input.email ?? '',
    startDtm: input.startDtm,
    answers: input.answers,
  }

  const res = await fetch(`${BASE}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    // 응답 본문에 원인이 담겨 오는 경우가 있어요. 서버 로그로만 보냅니다. (CLAUDE.md §4)
    const detail = await res.text().catch(() => '')
    throw new CareernetError(
      'report http error',
      `HTTP ${res.status}${detail ? ` / ${detail.slice(0, 300)}` : ''}`,
    )
  }

  return unwrap((await res.json()) as CareernetEnvelope)
}

/** 인증키 잔여일. 2년 만료라 만료되면 서비스 전체가 멈춰요. (CLAUDE.md §4) */
export function keyExpiry(now: Date): { expiresAt: string | null; daysLeft: number | null } {
  const raw = process.env.CAREERNET_KEY_EXPIRES_AT
  if (!raw) return { expiresAt: null, daysLeft: null }

  const expiresAt = new Date(raw)
  if (Number.isNaN(expiresAt.getTime())) return { expiresAt: raw, daysLeft: null }

  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000)
  return { expiresAt: expiresAt.toISOString().slice(0, 10), daysLeft }
}
