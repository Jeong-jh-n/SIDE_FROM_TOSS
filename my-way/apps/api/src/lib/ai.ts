/**
 * 로컬 추론 서버(`apps/ai`) 클라이언트.
 *
 * 파이썬 쪽은 "모델을 돌리는 기계"일 뿐이고, **프롬프트를 어떻게 만들지는 여기서 정해요.**
 * 그래야 모델을 갈아끼워도 앱의 말투·규칙이 한 곳에 남습니다.
 *
 * ## 지켜야 하는 것
 *
 * - 추론 서버는 `127.0.0.1` 에만 떠 있어요. 학습 데이터(AI허브) 성격상 추론도 이 머신을
 *   벗어나면 안 됩니다. 외부 주소를 기본값으로 두지 마세요.
 * - **자유 서술을 로그에 남기지 마세요.** (CLAUDE.md §2.8) 이 파일은 에러 메시지에도
 *   사용자 응답을 넣지 않아요.
 * - 생성 결과를 그대로 화면에 쓰면 안 됩니다. 판정 문구가 섞일 수 있어요. (CLAUDE.md §7)
 *   호출부에서 §7 규칙으로 한 번 거르세요.
 */

const AI_BASE_URL = process.env.AI_BASE_URL ?? 'http://127.0.0.1:8000'

/** 모델 생성은 느려요(수 초). 그래도 무한정 기다리진 않습니다. */
const GENERATE_TIMEOUT_MS = 30_000
const HEALTH_TIMEOUT_MS = 2_000

export interface AiHealth {
  status: 'up' | 'loading' | 'error' | 'unreachable'
  ready: boolean
  model?: string
  adapter?: string | null
  device?: string
  error?: string | null
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

async function request<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${AI_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    })

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

export async function aiHealth(): Promise<AiHealth> {
  try {
    return await request<AiHealth>('/health', { method: 'GET' }, HEALTH_TIMEOUT_MS)
  } catch {
    // 서버가 안 떠 있는 건 정상 상황이에요. AI 없이도 앱은 돌아가야 합니다.
    return { status: 'unreachable', ready: false }
  }
}

interface CompleteResponse {
  text: string
  elapsed_ms: number
}

export async function complete(options: {
  system?: string
  prompt: string
  maxNewTokens?: number
  temperature?: number
  /**
   * LoRA 어댑터를 쓸지. 기본 true.
   *
   * 어댑터는 고등학생 말투를 입힙니다. 취준생 트랙에는 끄는 편이 맞아요.
   */
  useAdapter?: boolean
}): Promise<string> {
  const body = await request<CompleteResponse>(
    '/complete',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system: options.system,
        prompt: options.prompt,
        max_new_tokens: options.maxNewTokens ?? 60,
        temperature: options.temperature ?? 0.7,
        use_adapter: options.useAdapter ?? true,
      }),
    },
    GENERATE_TIMEOUT_MS,
  )

  return body.text
}
