import { AiUnavailableError, type AiHealth, type AiProvider, type CompleteOptions } from './aiTypes.js'

/**
 * Vertex AI (서울 리전) 제공자.
 *
 * `FEED` 의 확정 구성입니다.
 *
 * ```
 * 모델   gemini-2.5-flash (128k)
 * 리전   asia-northeast3  (서울)
 * ```
 *
 * ## ★ 리전을 환경변수로 두지 마세요
 *
 * SDK·API 의 기본 리전이 `us-central1` 이라, 환경변수가 비면 **조용히 미국으로
 * 나갑니다.** 그래서 상수로 박아 뒀고 밖에서 바꿀 수 없게 했어요.
 *
 * 전역(global) 엔드포인트도 쓰면 안 됩니다. 구글 문서에 "리전 격리 또는 데이터
 * 레지던시 보장 없음" 이라고 명시돼 있어요.
 *
 * 서울 리전에서 쓸 수 있는 생성 모델은 2.5 Flash 하나뿐입니다. 모델을 바꾸려면
 * **리전 지원 여부를 먼저 확인하세요.**
 *
 * ## 인증 — API 키
 *
 * `AQ.` 로 시작하는 Vertex 계열 API 키를 `x-goog-api-key` 헤더로 보냅니다.
 * 실측으로 확인한 것들이에요.
 *
 * ```
 * generativelanguage.googleapis.com      403 blocked   ← Developer API 는 막혀 있음
 * aiplatform.googleapis.com (글로벌)      200
 * asia-northeast3-aiplatform… (서울)      200          ← 우리가 쓰는 곳
 * ```
 *
 * **같은 키가 글로벌에서도 통합니다.** 그래서 URL 을 잘못 쓰면 조용히 국외로 나가요.
 * 리전을 상수로 박아둔 이유가 이겁니다.
 *
 * 나중에 서비스 계정(OAuth)으로 바꾸려면 `authHeader()` 하나만 고치면 돼요.
 */

/** 서울. **상수입니다 — 환경변수로 만들지 마세요.** */
const REGION = 'asia-northeast3'

/** 서울 리전에서 쓸 수 있는 유일한 생성 모델이에요. */
const MODEL = 'gemini-2.5-flash'

/** 모델 생성은 느려요. 그래도 무한정 기다리진 않습니다. */
const TIMEOUT_MS = 30_000

/**
 * 안전 필터.
 *
 * 10턴 자유 대화가 붙어 있어서 기본값보다 조이는 쪽으로 뒀어요.
 * 우리 `safety.ts` 가 입력을 거르고, 여기서 출력을 한 번 더 겁니다.
 *
 * 차단되면 후보가 안 옵니다. 그건 오류가 아니라 정상 동작이라 **빈 결과로 다뤄요.**
 */
const SAFETY_SETTINGS = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' }))

function projectId(): string {
  const value = process.env.GOOGLE_CLOUD_PROJECT?.trim()
  if (!value) {
    throw new AiUnavailableError('Vertex 프로젝트가 설정되지 않았어요.')
  }
  return value
}

/**
 * 인증 헤더.
 *
 * 지금은 API 키예요. 서비스 계정으로 옮기려면 여기서 `google-auth-library` 의
 * `GoogleAuth.getAccessToken()` 을 불러 `authorization: Bearer …` 로 바꾸면 됩니다.
 * 토큰은 1시간짜리라 **만료 전에 갱신**해야 해요 — 매 요청 새로 받으면 느립니다.
 */
function authHeader(): Record<string, string> {
  const key = process.env.VERTEX_API_KEY?.trim()
  if (!key) {
    throw new AiUnavailableError('Vertex 인증이 아직 설정되지 않았어요.')
  }
  return { 'x-goog-api-key': key }
}

/** 리전이 박힌 엔드포인트. 전역 엔드포인트를 쓰지 않는다는 게 여기서 보장돼요. */
function endpoint(project: string): string {
  return (
    `https://${REGION}-aiplatform.googleapis.com/v1` +
    `/projects/${project}/locations/${REGION}` +
    `/publishers/google/models/${MODEL}:generateContent`
  )
}

interface GenerateResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
}

export const vertexProvider: AiProvider = {
  name: 'vertex',

  async complete(options: CompleteOptions): Promise<string> {
    const project = projectId()
    const auth = authHeader()

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const response = await fetch(endpoint(project), {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
          ...(options.system
            ? { systemInstruction: { parts: [{ text: options.system }] } }
            : {}),
          generationConfig: {
            maxOutputTokens: options.maxNewTokens ?? 60,
            temperature: options.temperature ?? 0.7,
            /*
             * **생각을 끕니다.**
             *
             * 2.5 Flash 는 답을 쓰기 전에 생각 토큰을 먼저 쓰는데, 그게
             * `maxOutputTokens` 예산에서 나가요. 끄지 않으면 짧은 요청이
             * 생각만 하다 끝납니다 — 실측에서 20토큰 중 17을 생각에 쓰고
             * 본문이 0자로 나왔어요(`finishReason: MAX_TOKENS`).
             *
             * 우리는 되묻는 질문 한 줄, 칭호 몇 개처럼 짧은 것만 뽑아서
             * 생각이 필요한 작업이 아닙니다.
             */
            thinkingConfig: { thinkingBudget: 0 },
          },
          safetySettings: SAFETY_SETTINGS,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // 본문에 사용자 응답이 되비칠 수 있어서 상태 코드만 남깁니다. (CLAUDE.md §2.8)
        throw new AiUnavailableError(`Vertex 가 ${response.status} 를 돌려줬어요.`)
      }

      const body = (await response.json()) as GenerateResponse

      // 안전 필터에 걸리면 후보가 없어요. 오류가 아니라 "쓸 게 없음" 입니다.
      const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
      return text ?? ''
    } catch (error) {
      if (error instanceof AiUnavailableError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiUnavailableError('Vertex 응답이 너무 늦어요.')
      }
      throw new AiUnavailableError('Vertex 에 연결하지 못했어요.')
    } finally {
      clearTimeout(timer)
    }
  },

  async health(): Promise<AiHealth> {
    const base: AiHealth = {
      status: 'unreachable',
      ready: false,
      provider: 'vertex',
      model: MODEL,
      region: REGION,
    }

    try {
      projectId()
      authHeader()
    } catch (error) {
      // 설정이 덜 된 상태. AI 없이도 앱은 돌아가야 하므로 오류로 터뜨리지 않아요.
      return { ...base, error: error instanceof Error ? error.message : '설정 미완료' }
    }

    return { ...base, status: 'up', ready: true, error: null }
  },
}
