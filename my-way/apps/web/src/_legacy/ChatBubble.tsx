import type { ChatMessage } from '../types'

export function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`bubble-row bubble-row--${message.role}`}>
      {message.role === 'ai' && <div className="bubble-avatar" aria-hidden="true" />}
      <div className={`bubble bubble--${message.role}`}>
        {message.kind === 'question' && <span className="bubble-tag">질문</span>}
        {message.kind === 'collect' && <span className="bubble-tag">정보수집</span>}
        <p>{message.text}</p>
      </div>
    </div>
  )
}

export function TypingBubble() {
  return (
    <div className="bubble-row bubble-row--ai">
      <div className="bubble-avatar" aria-hidden="true" />
      <div className="bubble bubble--ai bubble--typing">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
