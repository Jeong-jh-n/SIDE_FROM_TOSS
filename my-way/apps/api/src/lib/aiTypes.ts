/**
 * AI 제공자 공통 타입.
 *
 * 모델을 갈아끼워도 `routes/ai.ts` 는 손대지 않는 것이 목표예요.
 * 프롬프트·§7 필터·위험 신호 차단은 전부 그쪽에 있고, 여기는 "글자를 받아오는 일"만
 * 담당합니다.
 */

export interface CompleteOptions {
  system?: string
  prompt: string
  maxNewTokens?: number
  temperature?: number
  /**
   * LoRA 어댑터를 쓸지. **로컬 제공자 전용이에요.**
   *
   * 상용 API 에는 이런 개념이 없어서 무시됩니다. 호출부가 계속 넘겨도 되도록
   * 남겨 뒀어요. 현재 모든 호출부가 `false` 입니다. (apps/ai/README.md)
   */
  useAdapter?: boolean
}

export interface AiHealth {
  status: 'up' | 'loading' | 'error' | 'unreachable'
  ready: boolean
  /** 어느 제공자로 붙어 있는지. 배포에서 설정을 잘못 잡았는지 여기서 보입니다. */
  provider?: string
  model?: string
  adapter?: string | null
  device?: string
  /** 리전. 국외로 새지 않았는지 확인하는 용도예요. */
  region?: string
  error?: string | null
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

export interface AiProvider {
  readonly name: string
  complete(options: CompleteOptions): Promise<string>
  health(): Promise<AiHealth>
}
