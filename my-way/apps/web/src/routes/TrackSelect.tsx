import { useState } from 'react'
import { useNavigate } from 'react-router'
import { content } from '@/lib/content'
import { clearAllState, hasAnyState } from '@/lib/storage'
import { TopBar } from '@/features/shared/TopBar'
import { RestartButton } from '@/features/shared/RestartButton'
import type { TrackId } from '@/types/content'

/**
 * `/` — 트랙 선택.
 *
 * 대학생·취준생은 **서술(워밍업 → 심화) 먼저**예요. 명함 칭호를 손에 넣은 다음,
 * 더 하고 싶은 사람만 체크리스트(jobseeker_behavior)로 들어갑니다.
 */
const ENTRIES: { trackId: TrackId; title: string; caption: string }[] = [
  {
    trackId: 'teen',
    title: '중·고등학생',
    caption: '이야기를 정리하고 나만의 명함 문구를 받아요',
  },
  {
    trackId: 'jobseeker_behavior',
    title: '대학생 · 취준생',
    caption: '이야기를 정리하고 나만의 명함 문구를 받아요',
  },
]

export function TrackSelect() {
  const navigate = useNavigate()
  const [saved, setSaved] = useState(() => hasAnyState())

  return (
    <div className="page page--home">
      {/* 첫 화면이라 뒤로도, 첫화면으로도 필요 없어요. */}
      <TopBar title="" />

      <header className="home-hero">
        <p className="home-eyebrow">진로 돌아보기</p>
        <h1>
          어디에 해당하나요?
        </h1>
        <p className="home-sub">
          고른 쪽에 맞는 질문으로 이어갈게요. 몇 개만 답해도 <strong>나만의 명함 칭호</strong>를
          받을 수 있어요.
        </p>
      </header>

      {ENTRIES.map((entry) => (
        <button
          key={entry.trackId}
          type="button"
          className="card card--tile card--wide"
          onClick={() =>
            navigate(
              entry.trackId === 'jobseeker_behavior'
                ? `/warmup/jobseeker_narrative`
                : `/warmup/${entry.trackId}`,
            )
          }
        >
          <div className="card-head">
            <h2>{entry.title}</h2>
            <span className="chevron" aria-hidden="true">›</span>
          </div>
          <p className="card-desc">{entry.caption}</p>
          <p className="card-meta">
            {content.tracks[entry.trackId].itemCount}문항
            {entry.trackId === 'jobseeker_behavior' &&
              ` + ${content.tracks.jobseeker_narrative.itemCount}문항`}
          </p>
        </button>
      ))}

      {/*
        생성형 AI 사용 사전 고지. 앱인토스 정책상 **사용 사실을 미리 알려야** 해요.
        결과 카드 안의 표시만으로는 "사전" 고지가 되지 않습니다.
      */}
      <section className="card card--muted">
        <p className="hint">
          답한 내용을 바탕으로 <strong>AI가 명함 칭호를 만들고, 되묻거나 짧은 글을 써드려요.</strong>{' '}
          사람이 쓴 글이 아니라서 틀릴 수 있고, 판단이 아니라 참고로 봐주세요. AI 없이도 문답은
          그대로 진행돼요.
        </p>
      </section>

      {saved && (
        <div className="reset-row">
          <RestartButton
            label="저장된 내용 전체 지우기"
            title="전체 초기화할까요?"
            description="세 트랙의 답변, 검사 진행 상태, 명함 정보까지 이 기기에 저장된 내용이 모두 지워져요. 되돌릴 수 없어요."
            confirmLabel="전체 지우기"
            variant="text"
            onConfirm={() => {
              clearAllState()
              setSaved(false)
            }}
          />
        </div>
      )}

      <p className="footnote">
        여기서 정리하는 내용은 참고용이에요. 점수나 등급을 매기지 않아요.
        <br />
        답변은 서버가 아니라 이 기기에만 저장돼요.
      </p>
    </div>
  )
}
