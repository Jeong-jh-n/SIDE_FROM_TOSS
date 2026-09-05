import { describe, expect, it } from 'vitest'
import { teen } from '@/lib/content'
import { classifyTrigger, shouldFollowup, unevaluatedTriggers } from './followup'

describe('꼬리물기 — JSON trigger 대응', () => {
  it('JSON의 trigger를 모두 분류할 수 있다', () => {
    const kinds = teen.followupPolicy.triggers.map((t) => classifyTrigger(t.when))
    expect(kinds).toContain('length')
    expect(kinds).toContain('avoidant')
    expect(kinds).toContain('confidence')
  })

  it('이번 단계에서 미평가인 조건은 신뢰도 하나뿐이다', () => {
    expect(unevaluatedTriggers()).toHaveLength(1)
    expect(unevaluatedTriggers()[0]).toContain('신뢰도')
  })

  it('정책 모드는 conditional 이다 — 항상 발동이 아니다', () => {
    expect(teen.followupPolicy.mode).toBe('conditional')
  })
})

describe('발동 조건', () => {
  it('10자 미만이면 발동', () => {
    expect(shouldFollowup('짧아')).toBe(true)
  })

  it('회피 응답이면 길이와 무관하게 발동', () => {
    expect(shouldFollowup('음 잘 모르겠어 진짜로 하나도')).toBe(true)
    expect(shouldFollowup('그냥')).toBe(true)
    expect(shouldFollowup('없어')).toBe(true)
  })

  it('빈 응답(건너뛰기)도 발동 대상', () => {
    expect(shouldFollowup('')).toBe(true)
    expect(shouldFollowup('   ')).toBe(true)
  })

  it('충분히 길고 회피어가 없으면 발동하지 않는다', () => {
    expect(shouldFollowup('나는 사람들 앞에서 설명하는 걸 좋아하는 편이야')).toBe(false)
  })

  it('10자 경계 — 정확히 10자는 발동하지 않는다', () => {
    expect(shouldFollowup('가나다라마바사아자차')).toBe(false)
    expect(shouldFollowup('가나다라마바사아자')).toBe(true)
  })
})
