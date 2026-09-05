/**
 * AI 보조 호출. **우리 백엔드만** 부릅니다.
 *
 * 추론 서버는 로컬(`127.0.0.1:8000`)에만 떠 있고 프론트가 직접 부르지 않아요.
 * `apps/api`가 프롬프트를 만들고 §7 금지 표현을 걸러 줍니다.
 *
 * ## AI는 **있으면 좋은 것**이지 필수가 아니에요
 *
 * 추론 서버는 별도 프로세스라 안 떠 있을 수 있고, 떠 있어도 쓸 만한 질문을
 * 못 만들 수 있습니다(모델이 문장완성형으로 학습돼 있어요). 그래서 이 모듈은
 * **절대 예외를 던지지 않고 `null`을 돌려줍니다.** 호출부는 null이면 JSON에
 * 들어 있는 기존 보조질문을 그대로 쓰면 돼요.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/** 프롬프트 톤을 고르는 값. 서버가 트랙별 시스템 프롬프트를 골라요. */
export type AiTrack = 'teen' | 'jobseeker'

interface FollowupResponse {
  available: boolean
  followup: string | null
}

/**
 * 얇은 응답에 던질 보조질문을 받아와요.
 *
 * @param signal 문항을 넘겨버리면 요청을 취소해요. 늦게 온 응답이 다음 문항 화면에
 *               끼어들면 안 됩니다.
 * @returns 쓸 만한 질문이 없으면 `null`
 */
export async function fetchFollowup(
  question: string,
  answer: string,
  signal?: AbortSignal,
  track: AiTrack = 'teen',
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/ai/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, track }),
      signal,
    })

    if (!res.ok) return null

    const body = (await res.json()) as FollowupResponse
    return body.available && body.followup ? body.followup : null
  } catch {
    // 서버가 없거나 요청이 취소된 경우. 조용히 기존 보조질문으로 갑니다.
    return null
  }
}

interface FeedbackResponse {
  available: boolean
  feedback: string | null
}

export interface FeedbackEntry {
  question: string
  answer: string
}

/**
 * 결과 화면에 붙일 짧은 피드백을 받아와요.
 *
 * **정서적 신호 문항(§8)은 넘기지 마세요.** 그 응답을 근거로 부정적 판단 문구를
 * 만들면 안 됩니다. 호출부에서 걸러서 보냅니다.
 *
 * @returns 쓸 만한 피드백이 없으면 `null`. 그때는 기존 정리 화면만 보여주면 돼요.
 */
export async function fetchFeedback(
  entries: FeedbackEntry[],
  track: AiTrack,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/ai/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, track }),
      signal,
    })

    if (!res.ok) return null

    const body = (await res.json()) as FeedbackResponse
    return body.available && body.feedback ? body.feedback : null
  } catch {
    return null
  }
}

interface TaglineResponse {
  available: boolean
  taglines: string[]
}

/**
 * 명함에 넣을 한 줄(칭호)을 받아와요.
 *
 * 재료는 **자체 문답 응답만** 넘깁니다. 커리어넷 검사 결과를 섞으면
 * "공인 검사가 나를 이렇게 판정했다"로 읽혀요. (CLAUDE.md §7)
 *
 * @returns 후보 0~2개. 없으면 빈 배열이고, 화면은 기본 문구를 그대로 씁니다.
 */
export async function fetchTaglines(
  entries: FeedbackEntry[],
  track: AiTrack,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/api/ai/tagline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, track }),
      signal,
    })

    if (!res.ok) return []

    const body = (await res.json()) as TaglineResponse
    return body.available ? (body.taglines ?? []) : []
  } catch {
    return []
  }
}
