import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isTrackId, teen, narrative } from '@/lib/content'
import { loadState, saveState } from '@/lib/storage'
import { TopBar } from '@/features/shared/TopBar'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { containsRiskSignal } from '@/lib/safety'
import { fetchTaglines, type AiTrack, type FeedbackEntry } from '@/lib/aiApi'
import aiMarkSrc from '@/assets/aiMark.png'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { TEEN_STORAGE_KEY } from '@/features/teen/TeenFlow'
import { NARRATIVE_STORAGE_KEY } from '@/features/jobseekerNarrative/NarrativeFlow'

/**
 * 워밍업 — 짧게 답하고 명함 한 줄을 먼저 얻는 단계.
 *
 * ## 왜 앞에 두나
 *
 * 24문항을 다 풀어야 뭔가 나오는 구조는 진입 장벽이 큽니다. **몇 개만 답해도
 * 손에 잡히는 게 하나 생기면** 그다음 깊은 문답으로 넘어갈 이유가 생겨요.
 *
 * ## 중복해서 묻지 않습니다
 *
 * 여기서 쓰는 문항은 **심화 문답의 `recommendedOrder` 앞부분 그대로**이고,
 * 저장소도 같은 키를 씁니다. 그래서 워밍업에서 답한 문항은 심화 단계에서 다시
 * 나오지 않아요 — `flowMachine` 이 "첫 미응답 문항"부터 이어가기 때문입니다.
 *
 * ## 칭호는 제안입니다
 *
 * 응답마다 후보를 1~2개 보여주고 **고르는 건 사용자**예요. 안 고르고 넘어가도 됩니다.
 * 고른 값은 명함(`card` 저장소)의 한 줄로 들어가고, 나중에 명함 화면에서 고칠 수
 * 있어요. 판정이 아니라 제안이라는 걸 구조로 지킵니다. (CLAUDE.md §7)
 */

/** 워밍업에 쓸 문항 수. 짧아야 의미가 있지만, 칭호 재료로는 어느 정도 필요해요. */
const WARMUP_COUNT = 5

interface CardSaved {
  /** AI 칭호 칸. 직접 쓰는 칭호(`tagline`)와 따로 둡니다. */
  aiTagline: string
  taglineSource: 'self' | 'ai'
}

interface WarmupItem {
  key: string
  prompt: string
  supportFlag: boolean
}

function warmupItemsFor(track: string): { items: WarmupItem[]; storageKey: string; ai: AiTrack } {
  if (track === 'teen') {
    const order = teen.recommendedOrder ?? teen.items.map((item) => item.id)
    const byId = new Map(teen.items.map((item) => [String(item.id), item]))
    const items = order
      .map((id) => byId.get(String(id)))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, WARMUP_COUNT)
      .map((item) => ({
        key: String(item.id),
        prompt: item.prompt,
        supportFlag: Boolean(item.supportFlag),
      }))
    return { items, storageKey: TEEN_STORAGE_KEY, ai: 'teen' }
  }

  const order = narrative.flow.recommendedOrder
  const byId = new Map(narrative.items.map((item) => [item.id, item]))
  const items = order
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, WARMUP_COUNT)
    .map((item) => ({ key: item.id, prompt: item.prompt, supportFlag: false }))
  return { items, storageKey: NARRATIVE_STORAGE_KEY, ai: 'jobseeker' }
}

export function WarmupRoute() {
  const navigate = useNavigate()
  const { track } = useParams()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [collected, setCollected] = useState<{ item: WarmupItem; text: string }[]>([])
  const [phase, setPhase] = useState<'ask' | 'making' | 'pick'>('ask')
  const [candidates, setCandidates] = useState<string[]>([])
  const [picked, setPicked] = useState('')

  useEffect(() => {
    if (phase === 'ask') inputRef.current?.focus()
  }, [step, phase])

  /*
   * 워밍업 다음은 **같은 트랙의 남은 서술 문항**입니다.
   *
   * 서술을 먼저 끝내야 명함 칭호가 손에 들어와요. 체크리스트(트랙 B)는 그다음에
   * **원하는 사람만** 들어갑니다. 결과 화면에서 입구를 엽니다.
   */
  const deepPath = `/chat/${track}`

  /**
   * 모아둔 응답으로 **한 번에** 후보를 뽑아요.
   *
   * 문항마다 부르면 답할 때마다 3~7초를 기다려야 하고 GPU 시간도 배로 듭니다
   * (락으로 직렬 처리라 더 그래요). 그래서 마지막에 한 번만 부릅니다.
   */
  const makeTaglines = useCallback(
    async (rows: { item: WarmupItem; text: string }[], ai: AiTrack) => {
      setPhase('making')

      // 위험 신호가 있는 응답은 재료에서 빼요. (CLAUDE.md §8)
      const entries: FeedbackEntry[] = rows
        .filter((row) => row.text.trim() !== '' && !containsRiskSignal(row.text))
        .map((row) => ({ question: row.item.prompt, answer: row.text }))

      setCandidates(entries.length === 0 ? [] : await fetchTaglines(entries, ai))
      setPhase('pick')
    },
    [],
  )

  const handleNext = useCallback(
    (text: string, item: WarmupItem, storageKey: string, ai: AiTrack, isLast: boolean) => {
      // 심화 문답과 같은 저장소에 넣어요. 그래서 다시 묻지 않습니다.
      const saved = loadState<{ answers: FlowAnswer[]; probingKey: null; cursorKey: null }>(
        storageKey,
        { answers: [], probingKey: null, cursorKey: null },
      )
      const answers = saved.answers.filter((a) => a.key !== item.key)
      answers.push({ key: item.key, text, skipped: text.trim() === '' })
      saveState(storageKey, { ...saved, answers })

      const rows = [...collected, { item, text }]
      setCollected(rows)
      setInput('')

      // 여기서는 AI를 부르지 않아요. 리스트에 담기만 합니다.
      if (isLast) {
        void makeTaglines(rows, ai)
        return
      }
      setStep((prev) => prev + 1)
    },
    [collected, makeTaglines],
  )

  if (typeof track !== 'string' || !isTrackId(track) || track === 'jobseeker_behavior') {
    return (
      <div className="page page--result">
        <TopBar title="" />
        <div className="page page--empty">
          <h1>여기서 시작할 수 없어요</h1>
          <button type="button" className="button button--primary" onClick={() => navigate('/')}>
            처음으로
          </button>
        </div>
      </div>
    )
  }

  const { items, storageKey, ai } = warmupItemsFor(track)
  const item = items[Math.min(step, items.length - 1)]
  const isLast = step >= items.length - 1
  const risky = containsRiskSignal(input)
  const added = collected.filter((row) => row.text.trim() !== '').length

  // ── 문구 만들기 · 고르기 단계 ───────────────────────────────────
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
            className="button button--ghost"
            onClick={() => navigate('/card')}
            disabled={phase === 'making'}
          >
            명함 보기
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate(deepPath)}
            disabled={phase === 'making'}
          >
            이어서 마저 답하기
          </button>
        </div>
      </div>
    )
  }

  // ── 문답 단계 ──────────────────────────────────────────────────
  return (
    <div className="page page--result">
      <TopBar title="먼저 가볍게" current={step + 1} total={items.length} />

      <div className="tab-panel">
        <section className="card">
          <p className="stage-message">
            {items.length}개만 먼저 답해볼래요? 다 답하면 명함에 넣을 문구를 만들어 드려요.
          </p>
        </section>

        <section className="card">
          <p className="flow-prompt">{item.prompt}</p>
          <textarea
            ref={inputRef}
            className="flow-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={ai === 'teen' ? '편하게 적어줘' : '편하게 적어주세요'}
            rows={4}
          />
          {(item.supportFlag || risky) && <SupportNotice />}
        </section>

        {/* 답할 때마다 쌓이는 게 보이도록. AI는 아직 안 돌아요. */}
        {added > 0 && (
          <section className="card card--muted">
            <p className="hint">리스트에 추가되었습니다 · {added}개</p>
          </section>
        )}
      </div>

      <div className="flow-actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => handleNext('', item, storageKey, ai, isLast)}
        >
          {ai === 'teen' ? '넘길래' : '건너뛸게요'}
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => handleNext(input, item, storageKey, ai, isLast)}
          disabled={input.trim() === ''}
        >
          {isLast ? '문구 만들기' : '다음'}
        </button>
      </div>
    </div>
  )
}
