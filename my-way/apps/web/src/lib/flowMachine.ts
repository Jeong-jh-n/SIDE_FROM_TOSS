/**
 * 문답 진행 상태 전이.
 *
 * 컴포넌트에서 분리한 이유가 있어요. 꼬리물기가 붙으면 "지금 화면에 떠 있는 질문"이
 * 응답 개수만으로 결정되지 않습니다. 이걸 index 계산에 섞으면
 * **보조질문 단계에서 다음 문항의 꼬리물기가 뜨는** 버그가 생겨요.
 * 그래서 진행 중인 보조질문을 상태로 명시하고, 전이를 순수 함수로 테스트합니다.
 */

export interface FlowAnswer {
  key: string
  text: string
  probeText?: string
  skipped: boolean
}

export interface FlowItemLite {
  key: string
  /** 조건 충족 시 던지는 보조질문. 없으면 꼬리물기를 하지 않아요. */
  probe?: string
}

export interface FlowState {
  answers: FlowAnswer[]
  /** 보조질문을 던진 문항. null이면 본질문 단계예요. */
  probingKey: string | null
  /**
   * 지금 보고 있는 문항. **null이면 "첫 미응답 문항"**이라는 뜻이에요.
   *
   * 앞뒤로 오가려면 위치를 응답 개수에서 유도할 수 없어서 따로 둡니다.
   * 기본값을 null로 둔 덕분에 예전에 저장된 상태도 그대로 이어서 진행돼요.
   */
  cursorKey: string | null
}

export const EMPTY_FLOW: FlowState = { answers: [], probingKey: null, cursorKey: null }

export interface FlowStep {
  key: string
  kind: 'prompt' | 'probe'
}

/** 지금 물어야 할 것. 전부 끝났으면 null. */
export function currentStep(items: FlowItemLite[], state: FlowState): FlowStep | null {
  if (state.probingKey !== null) {
    const exists = items.some((item) => item.key === state.probingKey)
    if (exists) return { key: state.probingKey, kind: 'probe' }
  }

  // 사용자가 직접 옮겨온 위치가 우선이에요. 이미 답한 문항이어도 다시 보여줍니다.
  if (state.cursorKey !== null) {
    const exists = items.some((item) => item.key === state.cursorKey)
    if (exists) return { key: state.cursorKey, kind: 'prompt' }
  }

  const answered = new Set(state.answers.map((answer) => answer.key))
  const next = items.find((item) => !answered.has(item.key))
  return next ? { key: next.key, kind: 'prompt' } : null
}

/** 지금 문항의 위치(0-based). 끝났으면 -1. */
export function currentIndex(items: FlowItemLite[], state: FlowState): number {
  const step = currentStep(items, state)
  return step ? items.findIndex((item) => item.key === step.key) : -1
}

/**
 * 특정 문항으로 이동해요.
 *
 * 보조질문 중에 옮기면 보조질문은 접습니다. 본질문 응답은 그대로 남아요.
 */
export function goTo(items: FlowItemLite[], state: FlowState, key: string): FlowState {
  if (!items.some((item) => item.key === key)) return state
  return { ...state, cursorKey: key, probingKey: null }
}

/** 한 칸 이동. 범위를 벗어나면 그대로 둬요. */
export function move(items: FlowItemLite[], state: FlowState, delta: number): FlowState {
  const index = currentIndex(items, state)
  if (index === -1) return state

  const target = items[index + delta]
  return target ? goTo(items, state, target.key) : state
}

/**
 * 응답 뒤 커서를 다음 문항으로 옮겨요.
 *
 * 마지막 문항이면 null로 돌려놔서 "첫 미응답 문항" 규칙으로 되돌아갑니다.
 * 중간에 건너뛴 문항이 있으면 그리로 돌아가고, 없으면 완료 화면으로 가요.
 */
function advance(items: FlowItemLite[], key: string): string | null {
  const index = items.findIndex((item) => item.key === key)
  return items[index + 1]?.key ?? null
}

/** 본질문을 몇 개나 지났는지. 진행 표시용이에요. */
export function answeredCount(items: FlowItemLite[], state: FlowState): number {
  const answered = new Set(state.answers.map((answer) => answer.key))
  return items.filter((item) => answered.has(item.key)).length
}

function upsert(answers: FlowAnswer[], answer: FlowAnswer): FlowAnswer[] {
  const index = answers.findIndex((existing) => existing.key === answer.key)
  if (index === -1) return [...answers, answer]

  const next = [...answers]
  next[index] = answer
  return next
}

/**
 * 응답을 반영해요.
 * 본질문 응답이 얇으면(`shouldProbe`) 같은 문항의 보조질문 단계로 넘어갑니다.
 */
export function submit(
  items: FlowItemLite[],
  state: FlowState,
  text: string,
  shouldProbe: (text: string) => boolean,
): FlowState {
  const step = currentStep(items, state)
  if (!step) return state

  if (step.kind === 'probe') {
    const existing = state.answers.find((answer) => answer.key === step.key)
    return {
      answers: upsert(state.answers, {
        key: step.key,
        text: existing?.text ?? '',
        probeText: text,
        skipped: existing?.skipped ?? false,
      }),
      probingKey: null,
      cursorKey: advance(items, step.key),
    }
  }

  const item = items.find((entry) => entry.key === step.key)
  const answers = upsert(state.answers, { key: step.key, text, skipped: false })
  const needsProbe = Boolean(item?.probe) && shouldProbe(text)

  return {
    answers,
    probingKey: needsProbe ? step.key : null,
    // 보조질문이 뜨면 같은 문항에 머물러요. (CLAUDE.md §9)
    cursorKey: needsProbe ? step.key : advance(items, step.key),
  }
}

/**
 * 건너뛰기.
 * 보조질문 단계에서 건너뛰면 본질문 응답은 그대로 두고 보조질문만 넘어가요.
 */
export function skip(items: FlowItemLite[], state: FlowState): FlowState {
  const step = currentStep(items, state)
  if (!step) return state

  if (step.kind === 'probe') {
    return { ...state, probingKey: null, cursorKey: advance(items, step.key) }
  }

  return {
    answers: upsert(state.answers, { key: step.key, text: '', skipped: true }),
    probingKey: null,
    cursorKey: advance(items, step.key),
  }
}
