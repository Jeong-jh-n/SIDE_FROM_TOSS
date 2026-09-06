import { describe, expect, it } from 'vitest'
import { stateHasContent } from './storage'

/**
 * "전체 지우기" 버튼 노출 판정.
 *
 * 화면은 마운트되자마자 빈 상태를 저장해요. 그래서 키가 있다는 것만으로 버튼을 띄우면,
 * 한 글자도 안 쓰고 들어갔다 나온 사람에게도 **지울 것 없는 버튼**이 보였습니다.
 */

describe('빈 껍데기는 내용 없음으로 본다', () => {
  it('문답 화면에 들어가기만 한 경우', () => {
    expect(stateHasContent('responses', { answers: [] })).toBe(false)
  })

  it('명함 화면에 들어가기만 한 경우 — 테마는 항상 값이 있다', () => {
    expect(
      stateHasContent('card', {
        info: { desiredCareer: '', strengths: '', hobby: '' },
        themeId: 'toss',
        name: '',
        tagline: '',
        aiTagline: '',
        taglineSource: 'self',
      }),
    ).toBe(false)
  })
})

describe('실제 내용이 있으면 지울 게 있다고 본다', () => {
  it('문답에 답한 경우', () => {
    expect(
      stateHasContent('responses', { answers: [{ key: '1', text: '그림', skipped: false }] }),
    ).toBe(true)
  })

  it('건너뛴 것도 사용자 행동이라 센다', () => {
    expect(stateHasContent('responses', { answers: [{ key: '1', text: '', skipped: true }] })).toBe(
      true,
    )
  })

  it('명함에 뭐라도 적은 경우', () => {
    expect(stateHasContent('card', { name: '김토스', themeId: 'toss' })).toBe(true)
    expect(stateHasContent('card', { info: { hobby: '러닝' }, themeId: 'toss' })).toBe(true)
    expect(stateHasContent('card', { aiTagline: '귀 기울이는 친구', themeId: 'toss' })).toBe(true)
  })
})

describe('예외 처리', () => {
  it('모르는 키는 내용이 있다고 본다', () => {
    // 지울 수 있는 걸 숨기는 것보다 낫습니다.
    expect(stateHasContent('무언가:새로운키', { whatever: 1 })).toBe(true)
  })

  it('객체가 아니면 내용 없음', () => {
    expect(stateHasContent('card', null)).toBe(false)
    expect(stateHasContent('card', 'string')).toBe(false)
  })
})
