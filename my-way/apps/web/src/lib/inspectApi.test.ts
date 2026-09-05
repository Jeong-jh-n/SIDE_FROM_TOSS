import { describe, expect, it } from 'vitest'
import { choicesOf, type InspectQuestion } from './inspectApi'

/** 실제 API 응답 형태를 그대로 옮긴 픽스처예요. */
const scale5 = {
  qitemNo: 1,
  question: '나는 내가 어떤 일을 좋아하는지 안다.',
  answer01: '전혀 그렇지 않다',
  answer02: '그렇지 않다',
  answer03: '보통이다',
  answer04: '그렇다',
  answer05: '매우 그렇다',
  answer06: null,
  answer07: null,
  answerScore01: '1',
  answerScore02: '2',
  answerScore03: '3',
  answerScore04: '4',
  answerScore05: '5',
  answerScore06: null,
  answerScore07: null,
} as unknown as InspectQuestion

/** 직업가치관(q=6): 양자택일 + 설명 2개. 설명에는 점수가 없어요. */
const paired = {
  qitemNo: 5,
  question: '두 개 가치 중에 자신에게 더 중요한 가치를 선택하세요.',
  answer01: '자기계발',
  answer02: '능력발휘',
  answer03: '직업을 통해 더 배우고 발전할 기회가 있는 것입니다.',
  answer04: '직업을 통해 자신의 능력을 발휘하는 것입니다.',
  answer05: null,
  answer06: null,
  answerScore01: '9',
  answerScore02: '10',
  answerScore03: null,
  answerScore04: null,
  answerScore05: null,
  answerScore06: null,
} as unknown as InspectQuestion

describe('5점 척도 (q=8)', () => {
  it('선택지 5개만 나온다', () => {
    expect(choicesOf(scale5)).toHaveLength(5)
  })

  it('점수는 1~5', () => {
    expect(choicesOf(scale5).map((c) => c.score)).toEqual([1, 2, 3, 4, 5])
  })

  it('설명은 붙지 않는다', () => {
    expect(choicesOf(scale5).every((c) => c.description === undefined)).toBe(true)
  })
})

describe('양자택일 + 설명 (q=6)', () => {
  it('선택지는 2개다 — 설명이 선택지로 새지 않는다', () => {
    const choices = choicesOf(paired)
    expect(choices).toHaveLength(2)
    expect(choices.map((c) => c.label)).toEqual(['자기계발', '능력발휘'])
  })

  it('설명이 순서대로 짝지어진다', () => {
    const choices = choicesOf(paired)
    expect(choices[0].description).toBe('직업을 통해 더 배우고 발전할 기회가 있는 것입니다.')
    expect(choices[1].description).toBe('직업을 통해 자신의 능력을 발휘하는 것입니다.')
  })

  it('점수는 원본 값을 그대로 쓴다', () => {
    expect(choicesOf(paired).map((c) => c.score)).toEqual([9, 10])
  })
})

describe('빈 칸 처리 (회귀)', () => {
  it('null 라벨이 "null" 문자열로 새어나오지 않는다', () => {
    const all = [...choicesOf(scale5), ...choicesOf(paired)]
    expect(all.some((c) => c.label === 'null')).toBe(false)
    expect(all.some((c) => c.description === 'null')).toBe(false)
  })

  it('빈 문자열도 걸러낸다', () => {
    const q = {
      answer01: '있음',
      answer02: '',
      answerScore01: '1',
      answerScore02: '2',
    } as unknown as InspectQuestion
    expect(choicesOf(q)).toHaveLength(1)
  })

  it('점수가 NaN이 되지 않는다', () => {
    expect(choicesOf(scale5).every((c) => Number.isFinite(c.score))).toBe(true)
  })
})
