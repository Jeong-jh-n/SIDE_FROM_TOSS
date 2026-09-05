import { describe, expect, it } from 'vitest'
import { anyRiskSignal, containsDistressSignal, containsRiskSignal, needsSupport } from './safety'

/**
 * 위험 신호 감지 테스트.
 *
 * **놓치는 것보다 과하게 잡는 쪽**이 설계 의도예요. 오탐은 안내 카드가 하나 더 뜨는
 * 비용이지만, 미탐은 비교할 수 없습니다. 경계 케이스는 잡히는 걸 기대값으로 둡니다.
 */

describe('직접 신호 — 문맥 없이 바로 잡는다', () => {
  it.each([
    '그냥 죽고 싶어',
    '죽고싶다',
    '살기 싫어졌어',
    '자해를 한 적 있어',
    '다 포기하고 사라지고 싶어',
    '없어지고 싶다는 생각을 해',
  ])('%s', (text) => {
    expect(containsRiskSignal(text)).toBe(true)
  })

  it('띄어쓰기를 바꿔도 잡는다', () => {
    expect(containsRiskSignal('죽 고 싶 어')).toBe(true)
    expect(containsRiskSignal('죽고... 싶어')).toBe(true)
  })
})

describe('정서적 어려움 신호 (CLAUDE.md §8)', () => {
  it.each(['우울증', '우울해', '공황이 와', '불안장애 있어', '무기력해', '번아웃 왔어'])(
    '어려움 신호로 잡아요: %s',
    (text) => {
      // 실제로 "우울증" 이라고 답했는데 안내가 안 뜨고 "우울증 탐구자" 칭호가 나왔어요.
      expect(containsDistressSignal(text)).toBe(true)
      expect(needsSupport(text)).toBe(true)
    },
  )

  it('어려움 신호는 자살·자해 신호와 다르게 다뤄요', () => {
    // 자살·자해는 요청 전체를 막고, 어려움은 그 응답만 재료에서 뺍니다.
    expect(containsRiskSignal('우울증')).toBe(false)
    expect(containsRiskSignal('죽고 싶어')).toBe(true)
  })

  it('평범한 응답은 둘 다 아니에요', () => {
    expect(needsSupport('그림 그리기')).toBe(false)
  })
})

describe('약한 신호 — 문맥이 있어야 잡는다', () => {
  it('무력감 문맥과 함께 나오면 잡는다', () => {
    expect(containsRiskSignal('더 이상 버티기 힘들어')).toBe(true)
    expect(containsRiskSignal('혼자라서 다 끝내고 싶어')).toBe(true)
  })

  it('문맥 없이 단독이면 잡지 않는다', () => {
    // 진로 문답에서 흔한 표현이에요. 이것까지 잡으면 안내가 남발됩니다.
    expect(containsRiskSignal('이 전공은 포기하고 싶어')).toBe(false)
    expect(containsRiskSignal('과제를 빨리 끝내고 싶어')).toBe(false)
  })
})

describe('평범한 응답은 잡지 않는다', () => {
  it.each([
    '친구들 얘기 잘 들어주는 거',
    '성적이 떨어져서 걱정된다',
    '경력이 없는 게 제일 걸려요',
    '',
    '   ',
  ])('%s', (text) => {
    expect(containsRiskSignal(text)).toBe(false)
  })
})

describe('anyRiskSignal', () => {
  it('하나라도 걸리면 true', () => {
    expect(anyRiskSignal(['미술이 좋아', '죽고 싶어', '그림 그리기'])).toBe(true)
  })

  it('전부 평범하면 false', () => {
    expect(anyRiskSignal(['미술이 좋아', '그림 그리기'])).toBe(false)
  })

  it('빈 목록은 false', () => {
    expect(anyRiskSignal([])).toBe(false)
  })
})
