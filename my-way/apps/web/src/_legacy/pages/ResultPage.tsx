import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble, TypingBubble } from '../components/ChatBubble'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { TopicOrder } from '../components/TopicOrder'
import { useAppStore } from '../store/appStoreContext'
import { sendCoachingMessage } from '../api/careerApi'
import type { ChatMessage } from '../types'

type Tab = 'note' | 'talk'

/** 메타인지 / 구체화를 유도하는 시작 질문이에요. */
const STARTER_PROMPTS = [
  '제가 한 말 중에 눈에 띄는 게 있었나요?',
  '지금 진로를 더 좁히려면 뭘 해봐야 할까요?',
  '제 특기를 진로랑 어떻게 연결할 수 있을까요?',
]

let coachSeq = 0
function createMessage(role: ChatMessage['role'], text: string): ChatMessage {
  coachSeq += 1
  return { id: `c${coachSeq}`, role, kind: 'free', text }
}

/**
 * 정리 화면.
 *
 * 점수·등급·수치를 보여주지 않아요. 자체 문항은 타당화를 거치지 않아서
 * 남과 비교할 근거(규준)가 없기 때문이에요. 본인 응답 안에서의 상대 비교만 담아요.
 * (README §1, §5)
 */
export function ResultPage() {
  const navigate = useNavigate()
  const { note, resetAnswers } = useAppStore()

  const [tab, setTab] = useState<Tab>('note')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isRestartOpen, setIsRestartOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isBusy])

  const ask = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (text === '' || isBusy || !note) return

      setMessages((prev) => [...prev, createMessage('user', text)])
      setInput('')
      setIsBusy(true)
      try {
        const reply = await sendCoachingMessage({ history: messages, message: text, note })
        setMessages((prev) => [...prev, createMessage('ai', reply)])
      } finally {
        setIsBusy(false)
      }
    },
    [isBusy, messages, note],
  )

  if (!note) {
    return (
      <div className="page page--empty">
        <h1>아직 정리할 내용이 없어요</h1>
        <p>대화를 먼저 마쳐주세요.</p>
        <button type="button" className="button button--primary" onClick={() => navigate('/chat')}>
          대화하러 가기
        </button>
      </div>
    )
  }

  return (
    <div className="page page--result">
      <header className="sub-header">
        <button type="button" className="icon-button" onClick={() => navigate('/')} aria-label="뒤로">
          ‹
        </button>
        <strong>돌아본 내용</strong>
      </header>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'note'}
          className={tab === 'note' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('note')}
        >
          이야기 정리
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'talk'}
          className={tab === 'talk' ? 'tab tab--active' : 'tab'}
          onClick={() => setTab('talk')}
        >
          AI 진로 대화
        </button>
      </div>

      {tab === 'note' ? (
        <div className="tab-panel">
          <section className="card">
            <p className="note-summary">{note.summary}</p>
            <p className="note-meta">
              {note.totalCount}개 질문 중 {note.answeredCount}개에 답했어요.
            </p>
          </section>

          <section className="card">
            <h2 className="section-title">어떤 이야기를 많이 했나요</h2>
            <TopicOrder note={note} />
            <p className="hint">
              많이 이야기한 순서일 뿐, 좋고 나쁨이나 높고 낮음을 뜻하지 않아요.
            </p>
          </section>

          {note.keywords.length > 0 && (
            <section className="card">
              <h2 className="section-title">자주 나온 말</h2>
              <div className="chip-row">
                {note.keywords.map((keyword) => (
                  <span className="chip chip--done" key={keyword}>
                    {keyword}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* README §6 — 단정적 해석을 피하고 상담 자원을 함께 안내해요. */}
          <section className="card card--muted">
            <p className="hint hint--care">
              이 정리는 이야기한 내용을 되돌려주는 참고 자료예요. 진단이나 평가가 아니에요.
              <br />
              진로나 마음이 많이 힘들다면 혼자 두지 말고 도움을 받아보세요 —
              학교 상담실, 청소년상담 1388, 정신건강 상담 1577-0199.
            </p>
          </section>

          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => setTab('talk')}
          >
            이 내용으로 AI와 이야기하기
          </button>

          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => setIsRestartOpen(true)}
          >
            처음부터 다시 하기
          </button>
        </div>
      ) : (
        <div className="tab-panel tab-panel--chat">
          <div className="chat-scroll chat-scroll--inline" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="starter">
                <p className="starter-title">이런 걸 물어볼 수 있어요</p>
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="starter-chip"
                    onClick={() => void ask(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {isBusy && <TypingBubble />}
          </div>

          <form
            className="chat-input"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(input)
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="진로에 대해 물어보세요"
              disabled={isBusy}
            />
            <button type="submit" className="send-button" disabled={isBusy || input.trim() === ''}>
              보내기
            </button>
          </form>
        </div>
      )}

      {isRestartOpen && (
        <ConfirmSheet
          title="처음부터 다시 할까요?"
          description="지금까지의 답변과 이 정리 내용이 지워지고 처음부터 다시 시작해요. 희망 진로·특기·취미는 그대로 남아요."
          confirmLabel="다시 하기"
          onConfirm={() => {
            resetAnswers()
            setIsRestartOpen(false)
            navigate('/chat')
          }}
          onCancel={() => setIsRestartOpen(false)}
        />
      )}
    </div>
  )
}
