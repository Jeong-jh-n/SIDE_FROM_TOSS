import { describe, expect, it } from 'vitest'
import {
  answeredCount,
  currentIndex,
  currentStep,
  EMPTY_FLOW,
  goTo,
  move,
  skip,
  submit,
  type FlowItemLite,
  type FlowState,
} from './flowMachine'

const ITEMS: FlowItemLite[] = [
  { key: 'A', probe: 'A의 꼬리물기' },
  { key: 'B', probe: 'B의 꼬리물기' },
  { key: 'C' }, // 꼬리물기 없는 문항
]

const always = () => true
const never = () => false

describe('진행 순서', () => {
  it('처음에는 첫 문항의 본질문', () => {
    expect(currentStep(ITEMS, EMPTY_FLOW)).toEqual({ key: 'A', kind: 'prompt' })
  })

  it('전부 답하면 null', () => {
    const state: FlowState = {
      answers: ITEMS.map((item) => ({ key: item.key, text: 'x', skipped: false })),
      probingKey: null,
      cursorKey: null,
    }
    expect(currentStep(ITEMS, state)).toBeNull()
  })
})

describe('꼬리물기 — 같은 문항에 머문다 (회귀 테스트)', () => {
  it('얇게 답하면 같은 문항의 보조질문으로 간다', () => {
    const next = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    expect(next.probingKey).toBe('A')
    // 핵심: B가 아니라 A의 보조질문이어야 해요.
    expect(currentStep(ITEMS, next)).toEqual({ key: 'A', kind: 'probe' })
  })

  it('보조질문에 답하면 A에 붙고 그다음 B의 본질문으로 간다', () => {
    let state = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    state = submit(ITEMS, state, '조금 더 자세한 이야기', always)

    const a = state.answers.find((answer) => answer.key === 'A')
    expect(a?.text).toBe('짧아')
    expect(a?.probeText).toBe('조금 더 자세한 이야기')

    // B는 아직 답하지 않았어야 해요 — 예전 버그는 여기서 B를 건너뛰었습니다.
    expect(state.answers.some((answer) => answer.key === 'B')).toBe(false)
    expect(currentStep(ITEMS, state)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('보조질문 응답이 다음 문항에 잘못 기록되지 않는다', () => {
    let state = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    state = submit(ITEMS, state, '보조 답변', always)
    expect(state.answers).toHaveLength(1)
    expect(state.answers[0].key).toBe('A')
  })

  it('충분히 답하면 보조질문 없이 다음 문항으로', () => {
    const next = submit(ITEMS, EMPTY_FLOW, '충분히 긴 답변이야', never)
    expect(next.probingKey).toBeNull()
    expect(currentStep(ITEMS, next)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('꼬리물기가 없는 문항은 얇게 답해도 그냥 넘어간다', () => {
    let state: FlowState = { answers: [], probingKey: null, cursorKey: null }
    state = submit(ITEMS, state, 'a', never)
    state = submit(ITEMS, state, 'b', never)
    // 이제 C 차례. C에는 probe 가 없어요.
    const next = submit(ITEMS, state, '짧아', always)
    expect(next.probingKey).toBeNull()
    expect(currentStep(ITEMS, next)).toBeNull()
  })
})

describe('건너뛰기', () => {
  it('본질문을 건너뛰면 skipped로 남고 다음 문항으로', () => {
    const next = skip(ITEMS, EMPTY_FLOW)
    expect(next.answers[0]).toEqual({ key: 'A', text: '', skipped: true })
    expect(currentStep(ITEMS, next)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('보조질문을 건너뛰면 본질문 응답은 남는다', () => {
    let state = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    state = skip(ITEMS, state)

    expect(state.answers.find((a) => a.key === 'A')?.text).toBe('짧아')
    expect(state.answers.find((a) => a.key === 'A')?.probeText).toBeUndefined()
    expect(currentStep(ITEMS, state)).toEqual({ key: 'B', kind: 'prompt' })
  })
})

describe('진행 표시', () => {
  it('보조질문 단계에서도 개수가 앞서가지 않는다', () => {
    const state = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    // A는 답했으니 1. 보조질문 중이라고 2가 되면 안 돼요.
    expect(answeredCount(ITEMS, state)).toBe(1)
  })
})

describe('이어서 하기', () => {
  it('저장된 응답이 있으면 그다음 문항부터', () => {
    const state: FlowState = {
      answers: [{ key: 'A', text: 'x', skipped: false }],
      probingKey: null,
      cursorKey: null,
    }
    expect(currentStep(ITEMS, state)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('저장된 probingKey가 목록에 없으면 무시한다', () => {
    const state: FlowState = { answers: [], probingKey: '없는키', cursorKey: null }
    expect(currentStep(ITEMS, state)).toEqual({ key: 'A', kind: 'prompt' })
  })
})

describe('앞뒤로 오가기', () => {
  it('답한 뒤 커서가 다음 문항으로 간다', () => {
    const next = submit(ITEMS, EMPTY_FLOW, '충분히 긴 응답이에요', never)
    expect(next.cursorKey).toBe('B')
    expect(currentStep(ITEMS, next)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('이전으로 돌아가면 이미 답한 문항을 다시 보여준다', () => {
    const afterA = submit(ITEMS, EMPTY_FLOW, '충분히 긴 응답이에요', never)
    const back = move(ITEMS, afterA, -1)
    expect(currentStep(ITEMS, back)).toEqual({ key: 'A', kind: 'prompt' })
    // 응답은 그대로 남아 있어야 고쳐 쓸 수 있어요.
    expect(back.answers.find((answer) => answer.key === 'A')?.text).toBe('충분히 긴 응답이에요')
  })

  it('되돌아가 고쳐 써도 응답이 덮어써질 뿐 늘어나지 않는다', () => {
    const afterA = submit(ITEMS, EMPTY_FLOW, '처음 쓴 응답이에요', never)
    const back = move(ITEMS, afterA, -1)
    const edited = submit(ITEMS, back, '고쳐 쓴 응답이에요', never)
    expect(edited.answers).toHaveLength(1)
    expect(edited.answers[0].text).toBe('고쳐 쓴 응답이에요')
  })

  it('첫 문항에서 더 뒤로 가지 않는다', () => {
    expect(move(ITEMS, EMPTY_FLOW, -1)).toEqual(EMPTY_FLOW)
  })

  it('마지막 문항에서 더 앞으로 가지 않는다', () => {
    const atC = goTo(ITEMS, EMPTY_FLOW, 'C')
    expect(move(ITEMS, atC, 1)).toEqual(atC)
  })

  it('보조질문 중에 이동하면 보조질문을 접는다', () => {
    const probing = submit(ITEMS, EMPTY_FLOW, '짧아', always)
    expect(probing.probingKey).toBe('A')

    const moved = move(ITEMS, probing, 1)
    expect(moved.probingKey).toBeNull()
    expect(currentStep(ITEMS, moved)).toEqual({ key: 'B', kind: 'prompt' })
  })

  it('목록에 없는 키로는 이동하지 않는다', () => {
    expect(goTo(ITEMS, EMPTY_FLOW, '없는키')).toEqual(EMPTY_FLOW)
  })

  it('currentIndex 는 지금 문항의 위치를 준다', () => {
    expect(currentIndex(ITEMS, EMPTY_FLOW)).toBe(0)
    expect(currentIndex(ITEMS, goTo(ITEMS, EMPTY_FLOW, 'C'))).toBe(2)
  })

  it('마지막 문항을 답하면 커서가 풀려 완료로 간다', () => {
    let state = EMPTY_FLOW
    for (const item of ITEMS) {
      state = goTo(ITEMS, state, item.key)
      state = submit(ITEMS, state, '충분히 긴 응답이에요', never)
    }
    expect(state.cursorKey).toBeNull()
    expect(currentStep(ITEMS, state)).toBeNull()
  })
})
