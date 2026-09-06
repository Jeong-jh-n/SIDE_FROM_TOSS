import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { loadState, saveState } from '@/lib/storage'
import { containsRiskSignal, needsSupport } from '@/lib/safety'
import { EMPTY_TALK, TALK_KEY, spokenTurns, type TalkState } from '@/lib/talk'
import { fetchCharacters, sendTurn, type Character, type TalkTurn } from '@/lib/talkApi'
import { checkAge, type AgeCheck } from '@/lib/ageGate'
import { AgeBlocked } from '@/features/shared/AgeBlocked'

/**
 * `/talk/:id` — 캐릭터와 대화.
 *
 * ## 매 턴 검사해요
 *
 * 자유 대화라 무엇이든 들어올 수 있어요. 문답은 제출된 묶음을 한 번 보면 됐지만,
 * 여기는 **턴마다 양쪽을** 봐요. 진로·취업 이야기라 힘든 말이 나오기 쉽습니다.
 *
 * ```
 * 입력  자살·자해 신호  → 모델을 부르지 않음. 상담 자원 안내. 대화는 이어감
 *       그 외 어려움    → 그대로 진행. 상담 자원은 함께 안내
 * 출력  §7 위반         → 서버가 버리고 다시 뽑음 (sanitizeReply)
 * ```
 *
 * **어려움을 말했다고 대화를 끊지 않습니다.** 가장 필요한 순간에 앱이 등을 돌리는
 * 셈이 돼요. 다정하게 받는 건 §8 이 금지한 "부정적 판단" 이 아닙니다.
 *
 * ## 나갔다 와도 이어져요
 *
 * 턴마다 저장합니다. URL 에 캐릭터가 박혀 있어서 재진입도 깔끔해요.
 */
export function TalkRoute() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)

  const [character, setCharacter] = useState<Character | null>(null)
  // 주소를 직접 치고 들어올 수 있어서 여기서도 봐요. 고르기 화면만 막으면 새요.
  const [age, setAge] = useState<AgeCheck | null>(null)
  const [limits, setLimits] = useState({ minTurns: 5, maxTurns: 10 })
  const [turns, setTurns] = useState<TalkTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  /** 대화 중 한 번이라도 어려움 신호가 나왔는지. 나오면 안내를 계속 띄워요. */
  const [supportShown, setSupportShown] = useState(false)

  // 캐릭터 정보와 하던 대화를 함께 불러와요.
  useEffect(() => {
    const controller = new AbortController()
    void checkAge().then(setAge)

    void fetchCharacters(controller.signal).then((list) => {
      const found = list.characters.find((c) => c.id === id) ?? null
      setCharacter(found)
      setLimits({ minTurns: list.minTurns, maxTurns: list.maxTurns })

      const saved = loadState<TalkState>(TALK_KEY, EMPTY_TALK)
      if (saved.characterId === id && saved.turns.length > 0) {
        setTurns(saved.turns)
        setSupportShown(saved.turns.some((t) => t.role === 'user' && needsSupport(t.text)))
        return
      }

      // 첫 마디는 모델을 부르지 않고 그대로 씁니다 — 첫 화면이 빨라야 해요.
      if (found !== null) {
        const opening: TalkTurn[] = [{ role: 'character', text: found.opening }]
        setTurns(opening)
        saveState(TALK_KEY, { characterId: found.id, turns: opening })
      }
    })

    return () => controller.abort()
  }, [id])

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])

  const spoken = spokenTurns(turns)
  const canFinish = spoken >= limits.minTurns
  const atMax = spoken >= limits.maxTurns

  const send = useCallback(async () => {
    const text = input.trim()
    if (text === '' || busy || character === null) return

    const next: TalkTurn[] = [...turns, { role: 'user', text }]
    setTurns(next)
    setInput('')
    setNote('')
    saveState(TALK_KEY, { characterId: character.id, turns: next })

    if (needsSupport(text)) setSupportShown(true)

    /*
     * 자살·자해 신호는 **모델을 부르지 않아요.** 서버도 막지만 여기서 먼저 끊습니다 —
     * 그 말을 굳이 네트워크로 내보낼 이유가 없어요. (CLAUDE.md §2.8)
     */
    if (containsRiskSignal(text)) {
      setNote('지금은 답을 만들지 않을게요. 아래 안내를 먼저 봐주세요.')
      return
    }

    setBusy(true)
    const result = await sendTurn(character.id, next, undefined)
    setBusy(false)

    if (!result.available || result.reply === null) {
      setNote(
        result.blocked === 'risk'
          ? '지금은 답을 만들지 않을게요. 아래 안내를 먼저 봐주세요.'
          : '지금은 답을 만들지 못했어요. 다시 한번 말해줄래요?',
      )
      return
    }

    const replied: TalkTurn[] = [...next, { role: 'character', text: result.reply }]
    setTurns(replied)
    saveState(TALK_KEY, { characterId: character.id, turns: replied })
    inputRef.current?.focus()
  }, [busy, character, input, turns])

  if (age === 'blocked') return <AgeBlocked />

  if (character === null) {
    return (
      <div className="page page--result">
        <TopBar title="" />
        <div className="page page--empty">
          <h1>이야기를 시작할 수 없어요</h1>
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate('/talk')}
          >
            다시 고르기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--result">
      <TopBar title={character.name} current={spoken} total={limits.maxTurns} />

      <div className="tab-panel">
        <div className="talk-log">
          {turns.map((turn, index) => (
            <p
              key={`${index}-${turn.text.slice(0, 8)}`}
              className={turn.role === 'user' ? 'talk-bubble talk-bubble--me' : 'talk-bubble'}
            >
              {turn.text}
            </p>
          ))}
          {busy && <p className="talk-bubble talk-bubble--waiting">…</p>}
          <div ref={tailRef} />
        </div>

        {note !== '' && (
          <section className="card card--muted">
            <p className="hint">{note}</p>
          </section>
        )}

        {/* 한 번이라도 어려움 신호가 나오면 계속 보여줘요. (CLAUDE.md §8) */}
        {supportShown && <SupportNotice />}
      </div>

      <div className="talk-compose">
        <textarea
          ref={inputRef}
          className="flow-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={atMax ? '이야기를 정리할 시간이에요' : '편하게 적어주세요'}
          rows={2}
          disabled={busy || atMax}
        />
        <button
          type="button"
          className="button button--primary"
          onClick={() => void send()}
          disabled={busy || atMax || input.trim() === ''}
        >
          보내기
        </button>
      </div>

      <div className="flow-actions">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => navigate('/talk')}
          disabled={busy}
        >
          다른 사람 고르기
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => navigate('/note')}
          disabled={!canFinish || busy}
        >
          정리하기
        </button>
      </div>

      {/* 왜 안 눌리는지 알려줘요. 안 그러면 버튼이 고장 난 걸로 보입니다. */}
      {!canFinish && (
        <p className="note-meta talk-hint">
          {limits.minTurns - spoken}번 더 이야기하면 정리할 수 있어요.
        </p>
      )}
    </div>
  )
}
