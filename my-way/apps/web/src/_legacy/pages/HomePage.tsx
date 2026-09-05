import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmSheet } from '../components/ConfirmSheet'
import { useAppStore } from '../store/appStoreContext'
import { COLLECTED_INFO_META } from '../types'
import type { CollectedInfoKey } from '../types'
import { QUESTION_ITEMS } from '../data/questions'

type Sheet = 'restart' | 'clear' | null

/**
 * 홈 화면.
 *
 * 문구에 "검사 / 진단 / 측정"을 쓰지 않아요. 자체 문항은 타당화를 거치지 않았고,
 * 기존 검사명도 화면에 노출하지 않아요. (README §6)
 */
export function HomePage() {
  const navigate = useNavigate()
  const { answers, collectedInfo, note, unfilledInfoKeys, displayName, resetAnswers, reset } =
    useAppStore()

  const [sheet, setSheet] = useState<Sheet>(null)

  const progress = Math.round((answers.length / QUESTION_ITEMS.length) * 100)
  const infoKeys = Object.keys(COLLECTED_INFO_META) as CollectedInfoKey[]
  const filledCount = infoKeys.length - unfilledInfoKeys.length
  const hasProgress = answers.length > 0 || note !== null

  const handleRestart = () => {
    resetAnswers()
    setSheet(null)
    navigate('/chat')
  }

  const handleClear = () => {
    reset()
    setSheet(null)
  }

  return (
    <div className="page page--home">
      <header className="home-hero">
        <p className="home-eyebrow">진로 돌아보기</p>
        <h1>
          {displayName ? `${displayName}님,` : '안녕하세요,'}
          <br />
          나만의 길을 찾아볼까요?
        </h1>
        <p className="home-sub">
          진로에 대한 생각을 대화로 정리하고, 나만의 가상 명함을 만들어보세요.
        </p>
      </header>

      <section
        className="card card--primary"
        onClick={() => navigate('/chat')}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === 'Enter' && navigate('/chat')}
      >
        <div className="card-head">
          <h2>AI와 대화하며 정리하기</h2>
          <span className="chevron" aria-hidden="true">›</span>
        </div>
        <p className="card-desc">
          질문 {QUESTION_ITEMS.length}개를 대화로 편하게 답해요. 희망 진로·특기·취미도 함께 모아요.
        </p>

        <div className="progress">
          <div className="progress-bar">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="progress-label">
            {answers.length} / {QUESTION_ITEMS.length}
          </span>
        </div>

        <div className="chip-row">
          {infoKeys.map((key) => (
            <span
              key={key}
              className={`chip ${collectedInfo[key].trim() ? 'chip--done' : 'chip--empty'}`}
            >
              {COLLECTED_INFO_META[key].label}
            </span>
          ))}
        </div>
      </section>

      <section className="card-grid">
        <button
          type="button"
          className="card card--tile"
          onClick={() => navigate('/result')}
          disabled={note === null}
        >
          <span className="tile-icon" aria-hidden="true">🗒️</span>
          <h3>돌아본 내용</h3>
          <p>{note ? '이야기 정리와 AI 대화' : '대화를 마치면 열려요'}</p>
        </button>

        <button
          type="button"
          className="card card--tile"
          onClick={() => navigate('/card')}
          disabled={filledCount === 0}
        >
          <span className="tile-icon" aria-hidden="true">🪪</span>
          <h3>가상 명함</h3>
          <p>
            {filledCount === 0
              ? '정보를 모으면 열려요'
              : `수집 ${filledCount}/${infoKeys.length} · PNG로 저장`}
          </p>
        </button>
      </section>

      {hasProgress && (
        <div className="reset-row">
          <button type="button" className="text-button" onClick={() => setSheet('restart')}>
            처음부터 다시 하기
          </button>
          <span className="reset-divider" aria-hidden="true" />
          <button
            type="button"
            className="text-button text-button--weak"
            onClick={() => setSheet('clear')}
          >
            전체 초기화
          </button>
        </div>
      )}

      <p className="footnote">
        이름·나이·성별 등은 토스 로그인에서 가져와요. 직접 입력하는 건 희망 진로·특기·취미뿐이에요.
        <br />
        답변은 서버가 아니라 이 기기의 브라우저 저장소에만 보관돼요.
        <br />
        여기서 정리한 내용은 참고용이며, 점수나 등급을 매기지 않아요.
      </p>

      {sheet === 'restart' && (
        <ConfirmSheet
          title="처음부터 다시 할까요?"
          description="지금까지의 답변과 정리 내용이 지워지고 처음부터 다시 시작해요. 희망 진로·특기·취미는 그대로 남아요."
          confirmLabel="다시 하기"
          onConfirm={handleRestart}
          onCancel={() => setSheet(null)}
        />
      )}

      {sheet === 'clear' && (
        <ConfirmSheet
          title="전체 초기화할까요?"
          description="답변, 정리 내용, 수집한 정보까지 모두 지워져요. 되돌릴 수 없어요."
          confirmLabel="전체 초기화"
          onConfirm={handleClear}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  )
}
