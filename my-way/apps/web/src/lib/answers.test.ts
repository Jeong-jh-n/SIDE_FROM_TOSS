import { describe, expect, it } from 'vitest'
import {
  AnswersError,
  buildAnswers,
  buildPartialAnswers,
  answersFormat,
  sanitizeOtherText,
  specialRule,
  type AnswerValue,
} from './answers'

const single = (score: number): AnswerValue => ({ kind: 'single', score })

describe('기본 조립', () => {
  // q=8 은 values 형식이라 pairs 예시로 쓸 수 없어요. q=6 을 씁니다.
  it('배열 순서 기준 1부터 번호를 매긴다', () => {
    expect(buildAnswers(6, [single(5), single(7), single(4)])).toBe('1=5 2=7 3=4')
  })

  it('공백으로 구분한다', () => {
    const result = buildAnswers(6, [single(1), single(2)])
    expect(result.split(' ')).toHaveLength(2)
  })

  it('응답이 비면 예외를 던진다', () => {
    expect(() => buildAnswers(8, [single(1), undefined])).toThrow(AnswersError)
  })
})

describe('특수 문항 — 24·25번 검사의 49번', () => {
  it('3개 선택을 쉼표로 잇는다', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 49 }, () => single(1))
    values[48] = { kind: 'multi', scores: [8, 1, 4] }
    expect(buildAnswers(24, values)).toContain('49=8,1,4')
  })

  it('개수가 모자라면 예외', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 49 }, () => single(1))
    values[48] = { kind: 'multi', scores: [8, 1] }
    expect(() => buildAnswers(24, values)).toThrow(/3개가 필요/)
  })

  it('단일 선택으로 오면 예외', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 49 }, () => single(1))
    expect(() => buildAnswers(25, values)).toThrow(/단일 선택 불가/)
  })
})

describe('특수 문항 — 35·36번 검사의 13번', () => {
  it('35번: 순위 2개 + 기타(8) 주관식', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 13 }, () => single(1))
    values[12] = { kind: 'ranked', scores: [1, 8], otherText: '방송계열' }
    expect(buildAnswers(35, values)).toContain('13=1,8:방송계열')
  })

  it('36번: 기타 선택지 번호가 9다', () => {
    expect(specialRule(36, 13)?.otherChoice).toBe(9)
    expect(specialRule(35, 13)?.otherChoice).toBe(8)
  })

  it('주관식에 띄어쓰기가 있으면 제거한다', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 13 }, () => single(1))
    values[12] = { kind: 'ranked', scores: [1, 9], otherText: '예체능 계열 쪽' }
    expect(buildAnswers(36, values)).toContain('13=1,9:예체능계열쪽')
  })

  it('주관식 없이 순위만 있어도 된다', () => {
    const values: (AnswerValue | undefined)[] = Array.from({ length: 13 }, () => single(1))
    values[12] = { kind: 'ranked', scores: [1, 3] }
    expect(buildAnswers(35, values)).toContain('13=1,3')
  })
})

describe('공백 제거', () => {
  it('모든 공백을 없앤다', () => {
    expect(sanitizeOtherText('방송 계열')).toBe('방송계열')
    expect(sanitizeOtherText('  앞뒤  공백  ')).toBe('앞뒤공백')
  })
})

describe('일반 문항에 특수 응답이 오면', () => {
  it('예외를 던진다', () => {
    const values: (AnswerValue | undefined)[] = [{ kind: 'multi', scores: [1, 2, 3] }]
    expect(() => buildAnswers(8, values)).toThrow(/단일 선택 문항/)
  })
})

describe('부분 조립 (진행 저장용)', () => {
  it('빈 문항은 건너뛴다', () => {
    expect(buildPartialAnswers([single(5), undefined, single(3)])).toBe('1=5 3=3')
  })
})

describe('검사번호별 answers 형식 (2026-08-31 실측)', () => {
  it('q=8 은 값만 쉼표로 잇는다', () => {
    // "1=4 2=4 ..." 로 보내면 커리어넷이 HTTP 500 을 돌려줘요. 오래 원인 불명이던 오류의 정체입니다.
    expect(answersFormat(8)).toBe('values')
    expect(buildAnswers(8, [single(4), single(4), single(5)])).toBe('4,4,5')
  })

  it('나머지 검사는 번호=값 형식을 유지한다', () => {
    expect(answersFormat(6)).toBe('pairs')
    expect(answersFormat(36)).toBe('pairs')
    expect(buildAnswers(6, [single(4), single(4), single(5)])).toBe('1=4 2=4 3=5')
  })

  it('특수 문항이 있는 검사는 pairs 여야 한다', () => {
    // 값 안에 쉼표가 들어가서(49=8,1,4) values 형식으로는 표현 자체가 불가능해요.
    for (const q of [24, 25, 35, 36]) {
      expect(answersFormat(q)).toBe('pairs')
    }
  })

  it('모르는 검사번호는 pairs 로 본다', () => {
    expect(answersFormat(999)).toBe('pairs')
  })
})
