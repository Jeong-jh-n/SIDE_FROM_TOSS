import { localProvider } from './aiLocal.js'
import { vertexProvider } from './aiVertex.js'
import { AiUnavailableError, type AiHealth, type AiProvider, type CompleteOptions } from './aiTypes.js'

/**
 * AI 호출 입구 — **모델을 갈아끼우는 유일한 지점이에요.**
 *
 * 프롬프트를 어떻게 만들지, 결과를 어떻게 거를지는 `routes/ai.ts` 가 정합니다.
 * 여기는 "글자를 받아오는 일" 만 해요. 그래서 제공자가 바뀌어도 아래는 그대로입니다.
 *
 * - 트랙별 어투 (반말 / 해요체)
 * - §7 필터 — 판정 문구·자소서 대필·능력 단정·유형 라벨 차단
 * - 위험 신호 차단 (자살·자해는 요청 전체, 어려움은 해당 응답만)
 * - AI 없이도 앱이 돌아가는 폴백
 *
 * ## 제공자 고르기
 *
 * ```
 * AI_PROVIDER=vertex   Vertex AI (서울 리전) — 토스판
 * AI_PROVIDER=local    로컬 추론 서버        — 사이드 (기본값)
 * ```
 *
 * **기본값이 `local` 인 이유.** Vertex 는 자격증명이 있어야 뜹니다. 기본을 vertex 로
 * 두면 설정 안 된 환경에서 매번 실패해요. 대신 배포에서 설정을 빠뜨리면 AI 기능이
 * 조용히 빠지므로, **`/api/ai/health` 가 어느 제공자인지 돌려줍니다.** 배포 후 한 번
 * 확인하세요.
 *
 * ## 제공자를 새로 붙일 때
 *
 * `aiTypes.ts` 의 `AiProvider` 를 구현하고 아래 `PROVIDERS` 에 넣으면 끝이에요.
 * 호출부는 손대지 않습니다.
 *
 * > 모델을 바꾸면 **필터 통과율을 다시 재세요.** 지금 필터는 EXAONE 7.8B 의 실패
 * > 패턴(조사로 끝남·명사 나열·마크다운)에 맞춰져 있습니다. 좋은 모델은 그런 실수를
 * > 덜 하지만 **새로운 실패 유형이 생길 수 있어요.** (`AI` 문서)
 */

const PROVIDERS: Record<string, AiProvider> = {
  local: localProvider,
  vertex: vertexProvider,
}

function provider(): AiProvider {
  const name = process.env.AI_PROVIDER?.trim() || 'local'
  return PROVIDERS[name] ?? localProvider
}

/** 설정된 제공자 이름. 알 수 없는 값이면 실제로 쓰이는 쪽을 돌려줘요. */
export function providerName(): string {
  return provider().name
}

export async function complete(options: CompleteOptions): Promise<string> {
  return provider().complete(options)
}

export async function aiHealth(): Promise<AiHealth> {
  try {
    return await provider().health()
  } catch {
    return { status: 'unreachable', ready: false, provider: providerName() }
  }
}

export { AiUnavailableError }
export type { AiHealth, CompleteOptions }
