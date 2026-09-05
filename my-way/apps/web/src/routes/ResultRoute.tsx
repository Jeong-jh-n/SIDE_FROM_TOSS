import { useNavigate, useParams } from 'react-router'
import { isTrackId } from '@/lib/content'
import { clearState, loadState, TRACK_KEYS } from '@/lib/storage'
import { RestartButton } from '@/features/shared/RestartButton'
import { TopBar } from '@/features/shared/TopBar'
import { BehaviorResult } from '@/features/jobseekerBehavior/BehaviorResult'
import { TeenResult } from '@/features/teen/TeenResult'
import { TEEN_STORAGE_KEY } from '@/features/teen/TeenFlow'
import { NarrativeResult } from '@/features/jobseekerNarrative/NarrativeResult'
import { InspectResults } from '@/features/inspect/InspectResults'
import { TRACK_TESTS } from '@/lib/inspectMeta'
import { NARRATIVE_STORAGE_KEY } from '@/features/jobseekerNarrative/NarrativeFlow'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'

/**
 * `/result/:track` — 결과.
 *
 * 자체 문항 정리 + 커리어넷 검사 진입이 이 화면에 모여요. (CLAUDE.md §6)
 * 자체 결과와 공인 검사 결과는 시각적으로 구분해요. (CLAUDE.md §7)
 */

function Empty({ message, actionLabel, onAction }: { message: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="page page--flow">
      <TopBar title="" />
      <div className="page page--empty">
      <h1>아직 정리할 내용이 없어요</h1>
      <p>{message}</p>
      <button type="button" className="button button--primary" onClick={onAction}>
        {actionLabel}
      </button>
      </div>
    </div>
  )
}

export function ResultRoute() {
  const { track } = useParams<{ track: string }>()
  const navigate = useNavigate()

  /** 이 트랙만 처음부터. 다른 트랙과 명함 정보는 건드리지 않아요. */
  const restart = (trackId: string) => {
    clearState(...(TRACK_KEYS[trackId] ?? []))
    navigate(`/chat/${trackId}`, { replace: true })
  }

  if (!track || !isTrackId(track)) {
    return (
      <div className="page page--flow">
        <TopBar title="" />
        <div className="page page--empty">
        <h1>없는 트랙이에요</h1>
        <button type="button" className="button button--primary" onClick={() => navigate('/')}>
          처음으로
        </button>
        </div>
      </div>
    )
  }

  if (track === 'jobseeker_behavior') {
    const saved = loadState<{ checked: string[]; submitted: boolean }>(
      'track:jobseeker_behavior',
      { checked: [], submitted: false },
    )

    if (!saved.submitted) {
      return (
        <Empty
          message="체크리스트를 먼저 마쳐주세요."
          actionLabel="체크리스트로 가기"
          onAction={() => navigate('/chat/jobseeker_behavior')}
        />
      )
    }

    return (
      <div className="page page--result">
        <TopBar title="지금 어디쯤인지" />
        <BehaviorResult checked={saved.checked} />
        <div className="tab-panel">
          {/* 대학생 트랙은 behavior → narrative 로 이어져요. (CLAUDE.md §10) */}
          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => navigate('/chat/jobseeker_narrative')}
          >
            이어서 이야기 정리하기
          </button>
          <RestartButton
            label="체크리스트 다시 하기"
            title="다시 할까?"
            description="체크한 항목이 지워지고 처음부터 다시 골라. 이야기 정리와 명함 정보는 그대로 남아."
            confirmLabel="다시 하기"
            onConfirm={() => restart('jobseeker_behavior')}
          />
        </div>
      </div>
    )
  }

  if (track === 'teen') {
    const { answers } = loadState<{ answers: FlowAnswer[] }>(TEEN_STORAGE_KEY, { answers: [] })

    if (answers.length === 0) {
      return (
        <Empty
          message="문답을 먼저 진행해줘."
          actionLabel="문답하러 가기"
          onAction={() => navigate('/chat/teen')}
        />
      )
    }

    return (
      <div className="page page--result">
        <TopBar title="네가 한 말" />
        <TeenResult answers={answers} />
        <div className="tab-panel">
          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => navigate('/card')}
          >
            명함 만들러 가기
          </button>

          {/* 공인 검사로 이어져요. 고등학생 기준(25·36)입니다. (lib/inspectMeta.ts) */}
          <InspectResults
            tests={TRACK_TESTS.teen}
            onStart={(q) => navigate(`/inspect/${q}`)}
          />
          <RestartButton
            label="처음부터 다시 하기"
            title="다시 할까?"
            description="지금까지 한 말이 전부 지워지고 1번 문항부터 다시 시작해. 명함 정보는 그대로 남아."
            confirmLabel="다시 하기"
            onConfirm={() => restart('teen')}
          />
        </div>
      </div>
    )
  }

  const { answers } = loadState<{ answers: FlowAnswer[] }>(NARRATIVE_STORAGE_KEY, { answers: [] })

  if (answers.length === 0) {
    return (
      <Empty
        message="문답을 먼저 진행해주세요."
        actionLabel="문답하러 가기"
        onAction={() => navigate('/chat/jobseeker_narrative')}
      />
    )
  }

  return (
    <div className="page page--result">
      <TopBar title="성찰 자료" />
      <NarrativeResult answers={answers} />
      <div className="tab-panel">
        {/* 공인 검사로 이어져요. 측정은 커리어넷이 담당합니다. (CLAUDE.md §1)
            대학생·취준생 트랙은 직업가치관(6) + 진로개발준비도(8) 두 가지예요. */}
        {/* 서술을 끝냈으면 명함부터. 여기까지가 가볍게 즐기는 구간이에요. */}
        <button
          type="button"
          className="button button--primary button--block"
          onClick={() => navigate('/card')}
        >
          명함 만들러 가기
        </button>

        {/*
          여기서부터가 진지한 구간이에요. **원하는 사람만** 들어갑니다.
          체크리스트는 지금까지 해본 행동을 짚고 병목을 찾아줘요.
        */}
        <section className="card">
          <h2 className="section-title">더 해볼래요?</h2>
          <p className="stage-message">
            지금까지 어떤 준비를 해왔는지 짚어보면, 뭐가 막혀 있는지 보여요. 14개를 체크만
            하면 돼요.
          </p>
          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => navigate('/chat/jobseeker_behavior')}
          >
            체크리스트 해보기
          </button>
        </section>

        {/* 공인 검사로 이어져요. 측정은 커리어넷이 담당합니다. (CLAUDE.md §1)
            대학생·취준생 트랙은 직업가치관(6) + 진로개발준비도(8) 두 가지예요. */}
        <InspectResults
          tests={TRACK_TESTS.jobseeker_narrative}
          onStart={(q) => navigate(`/inspect/${q}`)}
        />

        <button
          type="button"
          className="button button--ghost button--block"
          onClick={() => navigate('/summary')}
        >
          전체 정리해서 보기
        </button>

        <RestartButton
          label="처음부터 다시 하기"
          title="다시 할까요?"
          description="지금까지 하신 말이 전부 지워지고 처음 질문부터 다시 시작해요. 명함 정보는 그대로 남아요."
          confirmLabel="다시 하기"
          onConfirm={() => restart('jobseeker_narrative')}
        />
      </div>
    </div>
  )
}
