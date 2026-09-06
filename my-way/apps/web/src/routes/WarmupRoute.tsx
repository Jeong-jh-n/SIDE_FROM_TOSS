import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { questions } from '@/lib/content'
import { loadState, saveState } from '@/lib/storage'
import { EMPTY_RESPONSES, RESPONSES_KEY, type ResponsesState } from '@/lib/responses'
import { TopBar } from '@/features/shared/TopBar'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { containsRiskSignal, needsSupport } from '@/lib/safety'
import { fetchTaglines, type AiTrack, type FeedbackEntry } from '@/lib/aiApi'
import aiMarkSrc from '@/assets/aiMark.png'

/**
 * 흐름 1 — 서술형 다섯 개.
 *
 * ## 짧게 답하고 손에 잡히는 걸 먼저 줍니다
 *
 * 문항을 잔뜩 풀어야 뭔가 나오는 구조는 진입 장벽이 커요. **다섯 개만 답해도
 * 명함 칭호가 하나 생기면** 그다음(캐릭터 대화)으로 넘어갈 이유가 생깁니다.
 *
 * ## 칭호는 제안이에요
 *
 * 후보를 보여주고 **고르는 건 사용자**입니다. 안 고르고 넘어가도 돼요. 고른 값은
 * 명함의 AI 칸으로 들어가고 **고칠 수는 없습니다.** 판정이 아니라 제안이라는 걸
 * 구조로 지켜요. (CLAUDE.md §7)
 */

/**
 * 어투.
 *
 * 앱인토스 미니앱은 **만 19세 이상**이 대상이라 해요체입니다.
 * 문항도 같은 이유로 대학생·취준생용(`jobseeker_narrative`)을 씁니다.
 */
const TONE: AiTrack = 'jobseeker'

interface CardSaved {
  /** AI 칭호 칸. 직접 쓰는 칭호(`tagline`)와 따로 둡니다. */
  aiTagline: string
  taglineSource: 'self' | 'ai'
}

export function WarmupRoute() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [collected, setCollected] = useState<{ key: string; prompt: string; text: string }[]>([])
  const [phase, setPhase] = useState<'ask' | 'making' | 'pick'>('ask')
  const [candidates, setCandidates] = useState<string[]>([])
  const [picked, setPicked] = useState('')

  useEffect(() => {
    if (phase === 'ask') inputRef.current?.focus()
  }, [step, phase])

  /**
   * 모아둔 응답으로 **한 번에** 후보를 뽑아요.
   *
   * 문항마다 부르면 답할 때마다 몇 초씩 기다려야 하고 호출 비용도 배로 듭니다.
   * 그래서 마지막에 한 번만 불러요.
   */
  const makeTaglines = useCallback(async (rows: { prompt: string; text: string }[]) => {
    setPhase('making')

    const written = rows.filter((row) => row.text.trim() !== '')

    // 위험 신호가 있는 응답은 재료에서 빼요. (CLAUDE.md §8)
    const entries: FeedbackEntry[] = written
      .filter((row) => !containsRiskSignal(row.text))
      .map((row) => ({ question: row.prompt, answer: row.text }))

    /*
     * 쓰긴 썼는데 **전부 위험 신호라** 재료가 없는 경우.
     *
     * 여기서 빈손으로 끝냅니다. 서버에 빈 목록을 보내면 '침묵자' 가 돌아오는데,
     * **힘든 말을 적은 사람에게 농담을 돌려주는 꼴이 돼요.** 아무 말도 안 한 것과
     * 힘든 말을 한 것은 다릅니다.
     */
    if (written.length > 0 && entries.length === 0) {
      setCandidates([])
      setPhase('pick')
      return
    }

    // 하나도 안 썼으면 빈 목록으로 물어봐요. 서버가 '침묵자' 를 돌려줍니다.
    setCandidates(await fetchTaglines(entries, TONE))
    setPhase('pick')
  }, [])

  const handleNext = useCallback(
    (text: string) => {
      const question = questions[step]
      if (question === undefined) return

      const saved = loadState<ResponsesState>(RESPONSES_KEY, EMPTY_RESPONSES)
      const answers = saved.answers.filter((a) => a.key !== question.key)
      answers.push({ key: question.key, text, skipped: text.trim() === '' })
      saveState(RESPONSES_KEY, { ...saved, answers })

      const rows = [...collected, { key: question.key, prompt: question.prompt, text }]
      setCollected(rows)
      setInput('')

      // 여기서는 AI를 부르지 않아요. 리스트에 담기만 합니다.
      if (step >= questions.length - 1) {
        void makeTaglines(rows)
        return
      }
      setStep((prev) => prev + 1)
    },
    [collected, makeTaglines, step],
  )

  const question = questions[Math.min(step, questions.length - 1)]
  const isLast = step >= questions.length - 1
  /*
   * 입력 내용을 봐서 안내를 띄워요. 문항 플래그만으로는 놓칩니다.
   *
   * `needsSupport` 는 자살·자해뿐 아니라 우울·번아웃 같은 어려움 신호도 봐요.
   * §8 이 `N4`(졸업 후 공백)를 지목한 것도 여기서 걸립니다 — 질문이 아니라
   * **답변에 드러날 때** 잡는 쪽이 맞아요. (lib/content.ts 의 SUPPORT_FLAGGED)
   */
  const risky = needsSupport(input)
  const added = collected.filter((row) => row.text.trim() !== '').length

  // ── 문구 만들기 · 고르기 ────────────────────────────────────────
  if (phase !== 'ask') {
    return (
      <div className="page page--result">
        <TopBar title="명함 문구 고르기" />

        <div className="tab-panel">
          {phase === 'making' && (
            <section className="card card--ai">
              <p className="stage-message">답해주신 내용으로 문구를 만드는 중이에요…</p>
            </section>
          )}

          {/* 후보는 제안이에요. 고르지 않고 넘어가도 됩니다. */}
          {phase === 'pick' && candidates.length > 0 && (
            <section className="card card--ai">
              <h2 className="section-title">이런 건 어때요?</h2>
              <div className="tagline-choices">
                {candidates.map((text) => (
                  <button
                    type="button"
                    key={text}
                    className={`chip${picked === text ? ' chip--on' : ''}`}
                    onClick={() => {
                      setPicked(text)
                      // AI 칸에 넣어요. 직접 쓴 칭호를 덮지 않습니다.
                      const card = loadState<CardSaved>('card', {
                        aiTagline: '',
                        taglineSource: 'self',
                      })
                      saveState('card', { ...card, aiTagline: text, taglineSource: 'ai' })
                    }}
                  >
                    <img src={aiMarkSrc} alt="" className="chip__mark" />
                    {text}
                  </button>
                ))}
              </div>
              <p className="note-meta">
                {picked
                  ? '명함에 넣어뒀어요. 마음에 안 들면 명함 화면에서 다시 뽑을 수 있어요.'
                  : 'AI가 만든 칭호예요. 고를 수는 있지만 고칠 수는 없어요.'}
              </p>
            </section>
          )}

          {phase === 'pick' && candidates.length === 0 && (
            <section className="card">
              <p className="stage-message">
                지금은 문구를 만들지 못했어요. 명함 화면에서 직접 적거나 다시 뽑을 수 있어요.
              </p>
            </section>
          )}
        </div>

        <div className="flow-actions">
          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => navigate('/card')}
            disabled={phase === 'making'}
          >
            명함 만들러 가기
          </button>
        </div>
      </div>
    )
  }

  // ── 문답 ───────────────────────────────────────────────────────
  return (
    <div className="page page--result">
      <TopBar title="먼저 가볍게" current={step + 1} total={questions.length} />

      <div className="tab-panel">
        <section className="card">
          <p className="stage-message">
            {questions.length}개만 먼저 답해볼래요? 다 답하면 명함에 넣을 문구를 만들어 드려요.
          </p>
        </section>

        <section className="card">
          <p className="flow-prompt">{question.prompt}</p>
          <textarea
            ref={inputRef}
            className="flow-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="편하게 적어주세요"
            rows={4}
          />
          {(question.supportFlag || risky) && <SupportNotice />}
        </section>

        {/* 답할 때마다 쌓이는 게 보이도록. AI는 아직 안 돌아요. */}
        {added > 0 && (
          <section className="card card--muted">
            <p className="hint">리스트에 추가되었습니다 · {added}개</p>
          </section>
        )}
      </div>

      <div className="flow-actions">
        <button type="button" className="button button--ghost" onClick={() => handleNext('')}>
          건너뛸게요
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => handleNext(input)}
          disabled={input.trim() === ''}
        >
          {isLast ? '문구 만들기' : '다음'}
        </button>
      </div>
    </div>
  )
}
