import { AiUnavailableError, type AiHealth, type AiProvider, type CompleteOptions } from './aiTypes.js'

/**
 * 로컬 추론 서버(`apps/ai`) 제공자.
 *
 * 사이드 프로젝트에서 씁니다. EXAONE 을 이 머신에서 돌려요.
 *
 * ## 지켜야 하는 것
 *
 * - 추론 서버는 `127.0.0.1` 에만 떠 있어요. **AI허브로 학습한 어댑터를 쓰는 순간**
 *   학습도 추론도 이 머신을 벗어나면 안 됩니다. 외부 주소를 기본값으로 두지 마세요.
 * - **자유 서술을 로그에 남기지 마세요.** (CLAUDE.md §2.8) 에러 메시지에도 사용자
 *   응답을 넣지 않아요.
 */

const BASE_URL = process.env.AI_BASE_URL ?? 'http://127.0.0.1:8000'

const GENERATE_TIMEOUT_MS = 30_000
const HEALTH_TIMEOUT_MS = 2_000

/**
 * 추론 서버가 받아주는 상한. 넘기면 **422 로 거부돼요.**
 *
 * 예전에 220 을 보내서 모든 요청이 422 로 떨어진 적이 있습니다. 폴백이 조용히
 * 받아내는 바람에 "칭호가 안 나온다" 로만 보였어요. 그래서 여기서 잘라 둡니다.
 * (`apps/ai/server.py` 의 `MAX_NEW_TOKENS_CAP`)
 */
const MAX_NEW_TOKENS_CAP = 200

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal })

    if (!response.ok) {
      // 추론 서버의 detail 은 사용자 응답을 담지 않는 고정 문구예요.
      throw new AiUnavailableError(`추론 서버가 ${response.status} 를 돌려줬어요.`)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiUnavailableError('추론 서버 응답이 너무 늦어요.')
    }
    throw new AiUnavailableError('추론 서버에 연결하지 못했어요.')
  } finally {
    clearTimeout(timer)
  }
}

interface CompleteResponse {
  text: string
  elapsed_ms: number
}

export const localProvider: AiProvider = {
  name: 'local',

  async complete(options: CompleteOptions): Promise<string> {
    const body = await request<CompleteResponse>(
      '/complete',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system: options.system,
          prompt: options.prompt,
          max_new_tokens: Math.min(options.maxNewTokens ?? 60, MAX_NEW_TOKENS_CAP),
          temperature: options.temperature ?? 0.7,
          use_adapter: options.useAdapter ?? true,
        }),
      },
      GENERATE_TIMEOUT_MS,
    )

    return body.text
  },

  async health(): Promise<AiHealth> {
    try {
      const body = await request<AiHealth>('/health', { method: 'GET' }, HEALTH_TIMEOUT_MS)
      return { ...body, provider: 'local' }
    } catch {
      // 서버가 안 떠 있는 건 정상 상황이에요. AI 없이도 앱은 돌아가야 합니다.
      return { status: 'unreachable', ready: false, provider: 'local' }
    }
  },
}
