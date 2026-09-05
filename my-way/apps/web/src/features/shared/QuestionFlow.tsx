import { useEffect, useRef, useState } from 'react'
import { loadState, saveState } from '@/lib/storage'
import {
  answeredCount,
  currentIndex,
  currentStep,
  EMPTY_FLOW,
  move,
  skip,
  submit,
  type FlowAnswer,
  type FlowState,
} from '@/lib/flowMachine'
import { SupportNotice } from './SupportNotice'
import { containsRiskSignal } from '@/lib/safety'
import { TopBar } from './TopBar'

export type { FlowAnswer } from '@/lib/flowMachine'

/**
 * 트랙 A·C가 함께 쓰는 문답 화면.
 *
 * 문구는 전부 호출부가 JSON에서 읽어 넘겨요. 컴포넌트를 공유해도 톤은 트랙마다 다릅니다.
 * (CLAUDE.md §9)
 *
 * - 모든 문항에 **건너뛰기**를 제공해요. (§8)
 * - 꼬리물기는 **조건부**로만 발동하고, 발동하면 **같은 문항에 머뭅니다.**
 *   진행 판단은 `lib/flowMachine.ts`가 하고 여기서는 그리기만 해요.
 * - 문항 하나 답할 때마다 저장해 재진입 시 이어서 진행해요. (§5)
 */

/**
 * 보조질문을 기다리는 상한.
 *
 * 생성이 보통 3~7초라 넉넉히 잡되, 넘으면 JSON 문구로 확정해요.
 * 무한정 기다리면 문답이 멈춘 것처럼 보입니다.
 */
const AI_PROBE_TIMEOUT_MS = 8000

export interface FlowItem {
  key: string
  prompt: string
  /** 조건 충족 시 던지는 보조질문 */
  probe?: string
  /** 어려움을 시사할 수 있는 문항. 상담 자원 안내를 노출해요. */
  supportFlag?: boolean
}

interface Props {
  title: string
  items: FlowItem[]
  storageKey: string
  placeholder: string
  skipLabel: string
  doneLabel: string
  /** 응답이 얇은지 판정. false를 돌려주면 보조질문 없이 다음 문항으로 갑니다. */
  shouldProbe: (text: string) => boolean
  /**
   * 보조질문을 AI로 다듬어 오는 함수(선택).
   *
   * **없어도 됩니다.** 넘기지 않으면 JSON의 고정 보조질문만 써요. 넘기더라도
   * 화면은 고정 보조질문을 **먼저 그리고**, AI 응답이 도착하면 그때 바꿔 끼웁니다.
   * 모델 생성이 5~7초 걸려서 기다리게 하면 문답 흐름이 끊겨요.
   */
  aiFollowup?: (question: string, answer: string, signal: AbortSignal) => Promise<string | null>
  onDone: (answers: FlowAnswer[]) => void
}

export function QuestionFlow({
  title,
  items,
  storageKey,
  placeholder,
  skipLabel,
  doneLabel,
  shouldProbe,
  aiFollowup,
  onDone,
}: Props) {
  const [state, setState] = useState<FlowState>(() => loadState(storageKey, EMPTY_FLOW))
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  /**
   * 확정된 보조질문 문구.
   *
   * **한 번 정해지면 바뀌지 않아요.** 예전에는 JSON 문구를 먼저 띄우고 AI 응답이
   * 오면 갈아끼웠는데, 읽고 있는 문장이 몇 초 뒤에 바뀌어 버렸습니다.
   * 그래서 정해질 때까지 기다렸다가 한 번만 그립니다.
   */
  const [probeText, setProbeText] = useState<string | null>(null)

  const step = currentStep(items, state)
  const item = step ? items.find((entry) => entry.key === step.key) : undefined
  const done = step === null

  useEffect(() => {
    saveState(storageKey, state)
  }, [state, storageKey])

  /**
   * 문항이 바뀌면 저장된 응답을 입력창에 채워요.
   *
   * 앞뒤로 오갈 수 있으니 이미 답한 문항으로 돌아오면 **고쳐 쓸 수 있어야** 합니다.
   * 빈 채로 두면 지웠다고 오해하거나, 다시 저장할 때 기존 응답이 날아가요.
   */
  useEffect(() => {
    const saved = state.answers.find((answer) => answer.key === step?.key)
    setInput(step?.kind === 'probe' ? (saved?.probeText ?? '') : (saved?.skipped ? '' : saved?.text ?? ''))
    inputRef.current?.focus()
    // 입력 중에 덮어쓰지 않도록 단계가 바뀔 때만 채웁니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key, step?.kind])

  /**
   * 보조질문 문구를 정해요. **딱 한 번만 정합니다.**
   *
   * 생성에 3~7초가 걸리는데, 예전처럼 JSON 문구를 먼저 띄우고 나중에 갈아끼우면
   * 읽는 중에 문장이 바뀌어 버려요. 그래서 정해질 때까지 기다렸다가 한 번만 그립니다.
   *
   * 기다림에는 상한이 있어요(`AI_PROBE_TIMEOUT_MS`). 넘으면 JSON 문구로 확정하고,
   * **그 뒤에 도착한 AI 응답은 버립니다.** 늦게 와서 화면을 흔드는 게 더 나빠요.
   */
  useEffect(() => {
    if (step?.kind !== 'probe') {
      setProbeText(null)
      return
    }

    const fallback = items.find((entry) => entry.key === step.key)?.probe ?? null
    const answered = state.answers.find((answer) => answer.key === step.key)
    const prompt = items.find((entry) => entry.key === step.key)?.prompt

    // 위험 신호가 있으면 AI를 부르지 않아요. 되묻는 대신 상담 자원을 안내합니다.
    const risky = Boolean(answered?.text && containsRiskSignal(answered.text))

    if (!aiFollowup || !answered?.text || !prompt || risky) {
      setProbeText(fallback)
      return
    }

    setProbeText(null)

    let settled = false
    const commit = (text: string | null) => {
      if (settled) return
      settled = true
      setProbeText(text ?? fallback)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => commit(null), AI_PROBE_TIMEOUT_MS)

    void aiFollowup(prompt, answered.text, controller.signal).then((question) => {
      if (!controller.signal.aborted) commit(question)
    })

    return () => {
      settled = true
      clearTimeout(timer)
      controller.abort()
    }
    // state.answers 전체를 의존성에 넣으면 매 입력마다 다시 부릅니다. 단계 키만 봐요.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.key, step?.kind, aiFollowup])

  if (done || !item) {
    return (
      <div className="page page--flow">
        <TopBar title={title} />
        <div className="page page--empty">
          <h1>다 들었어요</h1>
          <button
            type="button"
            className="button button--primary"
            onClick={() => onDone(state.answers)}
          >
            {doneLabel}
          </button>
        </div>
      </div>
    )
  }

  const isProbe = step.kind === 'probe'

  const handleSend = () => {
    const text = input.trim()
    if (text === '') return
    setState((prev) => submit(items, prev, text, shouldProbe))
  }

  const handleSkip = () => {
    setState((prev) => skip(items, prev))
  }

  const passed = answeredCount(items, state)
  /** 지금 문항에 쓴 말(입력 중 포함)에 위험 신호가 있는지. */
  const riskyHere =
    containsRiskSignal(input) ||
    Boolean(
      state.answers.find((answer) => answer.key === step?.key)?.text &&
        containsRiskSignal(state.answers.find((answer) => answer.key === step?.key)!.text),
    )
  const index = currentIndex(items, state)
  const canGoBack = index > 0
  const canGoForward = index !== -1 && index < items.length - 1
  /** 전부 답했거나 건너뛰었으면 언제든 마칠 수 있어요. */
  const allSettled = passed === items.length

  const handleMove = (delta: number) => {
    setState((prev) => move(items, prev, delta))
  }

  return (
    <div className="page page--flow">
      <TopBar title={title} current={Math.min(passed + 1, items.length)} total={items.length} />

      <div className="progress-bar progress-bar--thin">
        <span style={{ width: `${(passed / items.length) * 100}%` }} />
      </div>

      <div className="flow-body">
        {/* 보조질문일 때는 원래 질문을 위에 남겨둬 맥락이 끊기지 않게 해요. */}
        {isProbe && <p className="flow-context">{item.prompt}</p>}

        <p className="flow-prompt">
          {isProbe ? (probeText ?? '') : item.prompt}
        </p>
        {isProbe && probeText === null && <p className="flow-probe-note">잠깐만요…</p>}
        {isProbe && probeText !== null && <p className="flow-probe-note">조금만 더 들려주세요</p>}

        <textarea
          ref={inputRef}
          className="flow-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          rows={5}
        />

        {/*
          상담 자원 안내는 **문항 번호와 내용 둘 다** 보고 띄워요.
          supportFlag 는 24문항 중 2개뿐이라 나머지를 놓칩니다. (CLAUDE.md §8)
        */}
        {(item.supportFlag || riskyHere) && <SupportNotice />}
      </div>

      {/* 앞뒤로 오가며 고쳐 쓸 수 있어요. 보조질문 중에는 접고 본질문으로 옮겨갑니다. */}
      <div className="flow-nav">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => handleMove(-1)}
          disabled={!canGoBack}
        >
          ← 이전
        </button>
        <span className="flow-nav__position">
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => handleMove(1)}
          disabled={!canGoForward}
        >
          다음 →
        </button>
      </div>

      <div className="flow-actions">
        {/* 모든 문항에 건너뛰기를 열어둬요. (CLAUDE.md §8) */}
        <button type="button" className="button button--ghost" onClick={handleSkip}>
          {skipLabel}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={handleSend}
          disabled={input.trim() === ''}
        >
          저장하고 다음
        </button>
      </div>

      {/* 다 채운 뒤에도 앞뒤로 고쳐 볼 수 있게, 마무리는 따로 열어둬요. */}
      {allSettled && (
        <div className="flow-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => onDone(state.answers)}
          >
            {doneLabel}
          </button>
        </div>
      )}
    </div>
  )
}
