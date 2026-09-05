import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  choicesOf,
  createReport,
  fetchQuestions,
  InspectApiError,
  type InspectQuestion,
} from '@/lib/inspectApi'
import { buildAnswers, specialRule, type AnswerValue } from '@/lib/answers'
import { loadState, saveState } from '@/lib/storage'
import { TopBar } from '@/features/shared/TopBar'

/**
 * 커리어넷 검사 실시 — 문항을 API에서 받아 **우리 UI로** 보여줘요.
 * 커리어넷 페이지로 보내지 않습니다. (CLAUDE.md §5)
 *
 * 35~63문항이라 중간 이탈이 잦아요. **문항 하나 답할 때마다 저장**하고,
 * `startDtm`은 최초 시작 시각을 유지해요.
 */

interface Saved {
  /** 배열 순서(0-based) → 응답 */
  values: (AnswerValue | undefined)[]
  startDtm: number | null
  /** 결과표 URL. 화면·로그에 노출하지 않아요. (CLAUDE.md §2.4) */
  reportUrl: string | null
}

const EMPTY: Saved = { values: [], startDtm: null, reportUrl: null }

const storageKey = (q: number) => `inspect:${q}`

interface Props {
  q: number
  title: string
  trgetSe: string
  gender: string
  grade?: string
  onReport: (url: string) => void
}

export function InspectFlow({ q, title, trgetSe, gender, grade, onReport }: Props) {
  const [questions, setQuestions] = useState<InspectQuestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [saved, setSaved] = useState<Saved>(() => loadState(storageKey(q), EMPTY))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    void fetchQuestions(q)
      .then((items) => {
        if (cancelled) return
        setQuestions(items)
        setError(null)
        setOffline(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : '문항을 불러오지 못했어요.')
        setOffline(cause instanceof InspectApiError && cause.offline)
      })

    return () => {
      cancelled = true
    }
    // attempt 가 바뀌면 다시 시도해요.
  }, [q, attempt])

  // 문항 하나 답할 때마다 저장해요.
  useEffect(() => {
    saveState(storageKey(q), saved)
  }, [q, saved])

  const index = useMemo(() => {
    if (!questions) return 0
    const next = questions.findIndex((_, i) => saved.values[i] === undefined)
    return next === -1 ? questions.length : next
  }, [questions, saved.values])

  const answer = useCallback(
    (position: number, value: AnswerValue) => {
      setSaved((prev) => {
        const values = [...prev.values]
        values[position - 1] = value
        // 최초 시작 시각을 유지해요. 재진입해도 바뀌지 않습니다.
        const startDtm = prev.startDtm ?? Date.now()
        return { ...prev, values, startDtm }
      })
    },
    [],
  )

  const submit = useCallback(async () => {
    if (!questions || !saved.startDtm) return
    setSubmitting(true)
    setError(null)

    try {
      const answers = buildAnswers(q, saved.values.slice(0, questions.length))
      const report = await createReport({
        qestrnSeq: String(q),
        trgetSe,
        gender,
        grade,
        startDtm: saved.startDtm,
        answers,
      })

      // URL 전체를 보관해요. inspctSeq로 재구성하지 않아요. (CLAUDE.md §6)
      setSaved((prev) => ({ ...prev, reportUrl: report.url }))
      onReport(report.url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '결과를 만들지 못했어요.')
      setOffline(cause instanceof InspectApiError && cause.offline)
    } finally {
      setSubmitting(false)
    }
  }, [q, questions, saved.startDtm, saved.values, trgetSe, gender, grade, onReport])

  if (error && !questions) {
    return (
      <div className="page page--flow">
        <TopBar title={title} />
        <div className="page page--empty">
        <h1>문항을 불러오지 못했어요</h1>
        <p>{error}</p>

        {offline && (
          <p className="hint">
            검사 서버가 꺼져 있을 수 있어요. 개발 중이라면 다른 터미널에서
            <br />
            <code>npm run dev:api</code> 를 실행해주세요.
          </p>
        )}

        <button
          type="button"
          className="button button--primary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          다시 시도
        </button>

        {/* 지금까지 답한 문항은 그대로 남아 있어요. 서버가 돌아오면 이어서 진행됩니다. */}
        {saved.values.filter(Boolean).length > 0 && (
          <p className="hint">
            지금까지 답한 {saved.values.filter(Boolean).length}개는 저장돼 있어요.
          </p>
        )}
        </div>
      </div>
    )
  }

  if (!questions) {
    return (
      <div className="page page--flow">
        <TopBar title={title} />
        <div className="page page--empty">
          <h1>불러오는 중이에요</h1>
        </div>
      </div>
    )
  }

  const done = index >= questions.length

  if (done) {
    return (
      <div className="page page--flow">
        <TopBar title={title} />
        <div className="page page--empty">
        <h1>다 답했어요</h1>
        <p>결과표를 만들까요?</p>
        {error && <p className="notice notice--error">{error}</p>}
        {offline && (
          <p className="hint">
            검사 서버가 꺼져 있을 수 있어요. 개발 중이라면 <code>npm run dev:api</code> 를 실행해주세요.
            <br />
            답한 내용은 저장돼 있으니 서버를 켜고 다시 눌러도 돼요.
          </p>
        )}
        <button
          type="button"
          className="button button--primary"
          onClick={() => void submit()}
          disabled={submitting}
        >
          {submitting ? '만드는 중…' : '결과표 만들기'}
        </button>
        </div>
      </div>
    )
  }

  const question = questions[index]
  const position = index + 1
  const rule = specialRule(q, position)
  const choices = choicesOf(question)

  return (
    <div className="page page--flow">
      <TopBar title={title} current={position} total={questions.length} />

      <div className="progress-bar progress-bar--thin">
        <span style={{ width: `${(index / questions.length) * 100}%` }} />
      </div>

      <div className="flow-body">
        <p className="flow-prompt">{question.question}</p>
        {rule && <p className="flow-probe-note">{rule.label}</p>}

        {/* TODO: 다중선택·순위 문항(24/25의 49번, 35/36의 13번) 입력 컴포넌트.
            규칙은 lib/answers.ts 의 SPECIAL_ITEMS 에 있고, 현재 q=8은 단일 선택뿐이에요. */}
        <div className="choice-list">
          {choices.map((choice) => (
            <button
              key={choice.score}
              type="button"
              className="choice"
              onClick={() => answer(position, { kind: 'single', score: choice.score })}
            >
              <span className="choice-label">{choice.label}</span>
              {/* 직업가치관검사처럼 선택지에 설명이 딸린 검사가 있어요. */}
              {choice.description && (
                <span className="choice-description">{choice.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
