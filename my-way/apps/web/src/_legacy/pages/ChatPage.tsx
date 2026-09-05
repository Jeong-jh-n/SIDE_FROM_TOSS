import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChatBubble, TypingBubble } from '../components/ChatBubble'
import { useAppStore } from '../store/appStoreContext'
import { buildReflection, sendChatMessage } from '../api/careerApi'
import { fetchTossProfile, loginWithToss } from '../lib/toss'
import { QUESTION_ITEMS } from '../data/questions'
import { COLLECTED_INFO_META } from '../types'
import type { Answer, ChatKind, ChatMessage, CollectedInfo, CollectedInfoKey } from '../types'

const INFO_KEYS = Object.keys(COLLECTED_INFO_META) as CollectedInfoKey[]

type Stage =
  | { type: 'question'; index: number }
  | { type: 'collect'; index: number }
  | { type: 'free' }

let messageSeq = 0
function createMessage(role: ChatMessage['role'], kind: ChatKind, text: string): ChatMessage {
  messageSeq += 1
  return { id: `m${messageSeq}`, role, kind, text }
}

/** 각 단계에서 AI가 먼저 던지는 말이에요. */
function stagePrompt(stage: Stage): ChatMessage {
  if (stage.type === 'question') {
    return createMessage('ai', 'question', QUESTION_ITEMS[stage.index].question)
  }

  if (stage.type === 'collect') {
    return createMessage('ai', 'collect', COLLECTED_INFO_META[INFO_KEYS[stage.index]].question)
  }

  return createMessage(
    'ai',
    'free',
    '질문은 여기까지예요. 정리한 내용을 보러 가도 좋고, 더 이야기하고 싶은 게 있으면 편하게 적어주세요.',
  )
}

/**
 * `from`번째부터 아직 안 채운 정보수집 항목을 찾아요.
 * 이미 채운 항목은 (다시 하기 이후에도) 다시 묻지 않아요.
 */
function nextCollectStage(from: number, collectedInfo: CollectedInfo): Stage {
  for (let index = from; index < INFO_KEYS.length; index += 1) {
    if (collectedInfo[INFO_KEYS[index]].trim() === '') return { type: 'collect', index }
  }
  return { type: 'free' }
}

/** 이전에 답한 데까지 건너뛰고 이어서 시작해요. */
function createInitialChat(answers: Answer[], collectedInfo: CollectedInfo) {
  const answered = new Set(answers.map((answer) => answer.itemId))
  const nextItem = QUESTION_ITEMS.findIndex((item) => !answered.has(item.id))

  const stage: Stage =
    nextItem !== -1 ? { type: 'question', index: nextItem } : nextCollectStage(0, collectedInfo)

  const greeting = createMessage(
    'ai',
    'system',
    '안녕하세요, 진로에 대한 생각을 함께 정리해볼 거예요.\n정답은 없으니 떠오르는 대로 적어주세요. 넘어가고 싶은 질문은 건너뛰어도 괜찮아요.',
  )

  return { messages: [greeting, stagePrompt(stage)], stage }
}

/**
 * 대화 화면.
 * 자체 문항을 대화로 진행하고, 그 흐름에 정보수집을 붙여요.
 */
export function ChatPage() {
  const navigate = useNavigate()
  const {
    answers,
    collectedInfo,
    saveAnswer,
    setCollectedInfo,
    setNote,
    setTossProfile,
    displayName,
  } = useAppStore()

  const [initialChat] = useState(() => createInitialChat(answers, collectedInfo))
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat.messages)
  const [stage, setStage] = useState<Stage>(initialChat.stage)
  const [input, setInput] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const push = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message])
  }, [])

  const goToStage = useCallback(
    (next: Stage) => {
      setStage(next)
      push(stagePrompt(next))
    },
    [push],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isBusy])

  /** 질문이 끝나면 응답을 정리해요. 점수는 만들지 않아요. (README §1) */
  const finishQuestions = useCallback(
    async (lastAnswer: Answer) => {
      setIsBusy(true)
      try {
        const merged = QUESTION_ITEMS.map((item) => {
          if (item.id === lastAnswer.itemId) return lastAnswer
          const found = answers.find((answer) => answer.itemId === item.id)
          return found ?? { itemId: item.id, text: '' }
        })
        const note = await buildReflection(merged, QUESTION_ITEMS)
        setNote(note)
        push(
          createMessage(
            'ai',
            'system',
            '질문이 끝났어요. 이야기해준 내용을 정리해 두었어요.\n이제 명함에 들어갈 정보를 몇 가지만 여쭤볼게요.',
          ),
        )
      } finally {
        setIsBusy(false)
      }
    },
    [answers, push, setNote],
  )

  const handleSubmit = useCallback(
    async (rawText: string, skipped = false) => {
      const text = rawText.trim()
      if (isBusy) return
      if (!skipped && text === '') return

      push(
        createMessage(
          'user',
          stage.type === 'free' ? 'free' : stage.type,
          skipped ? '(건너뜀)' : text,
        ),
      )
      setInput('')

      if (stage.type === 'question') {
        const answer: Answer = { itemId: QUESTION_ITEMS[stage.index].id, text }
        saveAnswer(answer)

        const next = stage.index + 1
        if (next < QUESTION_ITEMS.length) {
          goToStage({ type: 'question', index: next })
        } else {
          await finishQuestions(answer)
          goToStage(nextCollectStage(0, collectedInfo))
        }
        return
      }

      if (stage.type === 'collect') {
        // 건너뛰면 빈 값 = "명확하지 않음". 나중에 LLM과 함께 채워요.
        setCollectedInfo(INFO_KEYS[stage.index], skipped ? '' : text)

        goToStage(nextCollectStage(stage.index + 1, collectedInfo))
        return
      }

      // 자유 대화: LLM 연결 전이라 목업 응답이 돌아와요.
      setIsBusy(true)
      try {
        const reply = await sendChatMessage({ history: messages, message: text, collectedInfo })
        push(createMessage('ai', 'free', reply))
      } finally {
        setIsBusy(false)
      }
    },
    [
      stage,
      isBusy,
      push,
      saveAnswer,
      setCollectedInfo,
      goToStage,
      finishQuestions,
      messages,
      collectedInfo,
    ],
  )

  /** 토스 로그인으로 이름·나이·성별 등을 가져와요. (서버 교환은 아직 미구현) */
  const handleTossLogin = useCallback(async () => {
    const login = await loginWithToss()
    if (!login) {
      push(
        createMessage(
          'ai',
          'system',
          '토스 앱 안에서만 로그인할 수 있어요. 지금은 건너뛰고 진행할게요.',
        ),
      )
      return
    }

    const profile = await fetchTossProfile(login)
    setTossProfile(profile)
    push(
      createMessage(
        'ai',
        'system',
        profile
          ? `${profile.name ?? ''}님, 반가워요. 기본 정보는 토스에서 가져왔어요.`
          : '로그인은 됐지만 프로필 조회는 서버 연동 후에 채워져요.',
      ),
    )
  }, [push, setTossProfile])

  const answeredCount = answers.length
  const placeholder =
    stage.type === 'collect'
      ? COLLECTED_INFO_META[INFO_KEYS[stage.index]].placeholder
      : stage.type === 'question'
        ? '편하게 답해주세요'
        : '무엇이든 물어보세요'

  return (
    <div className="page page--chat">
      <header className="chat-header">
        <button type="button" className="icon-button" onClick={() => navigate('/')} aria-label="뒤로">
          ‹
        </button>
        <div className="chat-header-title">
          <strong>진로 돌아보기</strong>
          <span>
            {answeredCount} / {QUESTION_ITEMS.length} 질문
          </span>
        </div>
        {displayName === '' && (
          <button type="button" className="text-button" onClick={() => void handleTossLogin()}>
            토스 로그인
          </button>
        )}
      </header>

      <div className="progress-bar progress-bar--thin">
        <span style={{ width: `${(answeredCount / QUESTION_ITEMS.length) * 100}%` }} />
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
        {isBusy && <TypingBubble />}

        {stage.type === 'free' && (
          <div className="chat-cta">
            <button
              type="button"
              className="button button--primary"
              onClick={() => navigate('/result')}
            >
              정리한 내용 보기
            </button>
            <button type="button" className="button button--ghost" onClick={() => navigate('/card')}>
              가상 명함 만들기
            </button>
          </div>
        )}
      </div>

      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit(input)
        }}
      >
        {stage.type !== 'free' && (
          <button
            type="button"
            className="skip-button"
            onClick={() => void handleSubmit('', true)}
            disabled={isBusy}
          >
            건너뛰기
          </button>
        )}
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          disabled={isBusy}
        />
        <button type="submit" className="send-button" disabled={isBusy || input.trim() === ''}>
          보내기
        </button>
      </form>
    </div>
  )
}
