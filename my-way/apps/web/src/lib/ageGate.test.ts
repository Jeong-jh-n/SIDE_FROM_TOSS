import { describe, expect, it } from 'vitest'
import { decideAge } from './ageGate'

/**
 * 연령 판정.
 *
 * **막는 쪽으로 기울면 안 되는 검사예요.** 확인이 안 되는 환경(안드로이드, 구버전,
 * 사용자 거부)에서 막아버리면 성인 사용자가 통째로 못 들어옵니다. 플랫폼이 이미
 * 만 19세 이상으로 거르고 있으니, 여기서는 **명시적으로 미달인 경우만** 막아요.
 */
describe('decideAge', () => {
  it('기준을 넘은 게 확인되면 통과', () => {
    expect(decideAge({ status: 'SHARING', isEligibleForAgeFeatures: true })).toBe('allowed')
  })

  it('미달이 확인되면 막아요', () => {
    expect(decideAge({ status: 'SHARING', isEligibleForAgeFeatures: false })).toBe('blocked')
  })

  it('공유를 거부한 건 미성년이 아니에요', () => {
    // 거부했다고 막으면 성인도 못 들어옵니다.
    expect(decideAge({ status: 'DECLINED_SHARING' })).toBe('unknown')
  })

  it.each(['UNSUPPORTED_OS', 'NOT_AVAILABLE', 'INVALID_REQUEST', 'FAILED'])(
    '확인할 수 없으면 통과시켜요: %s',
    (status) => {
      // 안드로이드·구버전이 여기예요. 막으면 대부분의 사용자가 못 들어옵니다.
      expect(decideAge({ status })).toBe('unknown')
    },
  )

  it('응답이 아예 없어도 통과', () => {
    expect(decideAge(null)).toBe('unknown')
    expect(decideAge(undefined)).toBe('unknown')
  })

  it('하한이 기준보다 낮으면 막아요 — 예전 응답 형태', () => {
    expect(decideAge({ status: 'SHARING', lowerBound: 13 })).toBe('blocked')
    expect(decideAge({ status: 'SHARING', lowerBound: 19 })).toBe('unknown')
  })
})
