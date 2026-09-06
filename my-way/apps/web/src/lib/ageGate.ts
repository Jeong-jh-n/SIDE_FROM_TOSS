import { User } from '@apps-in-toss/web-framework'

/**
 * 연령 확인.
 *
 * ## 왜 필요한가
 *
 * 앱인토스는 기본적으로 **만 19세 이상**이 대상이지만, 서비스 내용에 따라 별도
 * 청소년 보호 기준이 붙습니다. **만남·소개팅, 채팅, AI 채팅·상담, 민감 콘텐츠**가
 * 그 대상이고, 우리 10턴 대화는 "AI 채팅·상담" 에 들어가요.
 *
 * 기준은 **데이터를 저장하느냐가 아니라 무엇을 제공하느냐**입니다. 서버에 아무것도
 * 남기지 않아도 서비스 성격으로 걸립니다.
 *
 * ## 이게 유일한 방어선은 아니에요
 *
 * `User.getDeclaredAgeRange` 는 **iOS 전용**입니다. iOS 26 이상 + 토스앱 5.266.0
 * 이상이어야 하고, 안드로이드에는 없어요. 그래서 세 겹으로 봅니다.
 *
 * ```
 * 1. 플랫폼      앱인토스 자체가 만 19세 이상  ← 기본 방어선
 * 2. 이 확인     지원되는 기기에서 한 번 더
 * 3. 안전 필터   나이와 무관하게 매 턴 검사 (safety.ts, sanitizeReply)
 * ```
 *
 * 확인할 수 없는 환경에서 막아버리면 **안드로이드 사용자가 전부 못 들어옵니다.**
 * 그래서 `unknown` 은 통과시키고 1번에 기댑니다.
 */

/** 대화에 요구하는 나이. */
const AGE_GATE = 19

/** 브릿지가 응답하지 않을 때 기다릴 시간. 진입을 오래 붙잡지 않게. */
const TIMEOUT_MS = 2_000

export type AgeCheck =
  /** 기준을 넘은 게 확인됨. */
  | 'allowed'
  /** 기준에 못 미치는 게 확인됨. **여기만 막아요.** */
  | 'blocked'
  /** 확인할 수 없음(안드로이드·구버전·사용자 거부). 플랫폼 기준에 기댑니다. */
  | 'unknown'

/** SDK 응답에 필요한 부분만. 테스트에서 그대로 씁니다. */
interface AgeResult {
  status?: string
  isEligibleForAgeFeatures?: boolean
  lowerBound?: number
}

/**
 * 응답을 판정으로 바꿔요. **부수효과가 없어서 테스트가 됩니다.**
 *
 * `isEligibleForAgeFeatures` 가 명시적으로 `false` 일 때만 막아요. 값이 없거나
 * 공유를 거부한 경우(`DECLINED_SHARING`)는 "확인 불가" 이지 "미성년" 이 아닙니다.
 * 거부했다고 막으면 성인도 못 들어와요.
 */
export function decideAge(result: AgeResult | null | undefined): AgeCheck {
  if (result === null || result === undefined) return 'unknown'
  if (result.isEligibleForAgeFeatures === false) return 'blocked'
  if (result.isEligibleForAgeFeatures === true) return 'allowed'

  // 예전 응답 형태 대비. 하한이 기준보다 낮게 확인되면 막아요.
  if (typeof result.lowerBound === 'number' && result.lowerBound < AGE_GATE) return 'blocked'

  return 'unknown'
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('age gate timeout')), TIMEOUT_MS),
    ),
  ])
}

/**
 * 확인해요. **실패하면 `unknown`** 이고, 화면은 통과시킵니다.
 *
 * 지원 안 되는 버전에서는 SDK 가 예외를 던져요(`UNSUPPORTED_OS_VERSION` 등).
 * 그것도 "확인 불가" 이지 "미성년" 이 아닙니다.
 */
export async function checkAge(): Promise<AgeCheck> {
  try {
    if (!User.getDeclaredAgeRange.isSupported()) return 'unknown'
    const result = await withTimeout(User.getDeclaredAgeRange({ ageGates: [AGE_GATE] }))
    return decideAge(result)
  } catch {
    return 'unknown'
  }
}
