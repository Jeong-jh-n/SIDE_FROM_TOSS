import { useState } from 'react'
import { TopBar } from '@/features/shared/TopBar'
import { useNavigate, useParams } from 'react-router'
import { InspectFlow } from '@/features/inspect/InspectFlow'
import { AreaAskback } from '@/features/inspect/AreaAskback'
import { clearState, inspectKeys, loadState, saveState } from '@/lib/storage'
import { inspectMeta } from '@/lib/inspectMeta'
import { RestartButton } from '@/features/shared/RestartButton'

/**
 * `/inspect/:q` — 커리어넷 검사 실시 → 결과표 → 영역 되묻기.
 *
 * 허용 검사번호는 백엔드 화이트리스트가 최종 판정해요. 여기서는 진입만 거릅니다.
 */
const ALLOWED = [6, 8, 24, 25, 35, 36]

interface Saved {
  reportUrl: string | null
  lowestArea: string | null
}

export function InspectRoute() {
  const { q: raw } = useParams<{ q: string }>()
  const navigate = useNavigate()
  const q = Number(raw)

  const [saved, setSaved] = useState<Saved>(() =>
    loadState<Saved>(`inspect:result:${q}`, { reportUrl: null, lowestArea: null }),
  )
  const [resetSeq, setResetSeq] = useState(0)
  /** 장애 안내를 보고도 진행하겠다고 한 경우 */
  const [dismissedOutage, setDismissedOutage] = useState(false)

  const persist = (next: Saved) => {
    setSaved(next)
    saveState(`inspect:result:${q}`, next)
  }

  /** 검사를 처음부터. 응답·시작시각·결과표 URL·선택 영역을 모두 지워요. */
  const restartInspect = () => {
    clearState(...inspectKeys(q))
    setSaved({ reportUrl: null, lowestArea: null })
  }

  if (!Number.isInteger(q) || !ALLOWED.includes(q)) {
    return (
      <div className="page page--flow">
        <TopBar title="" />
        <div className="page page--empty">
        <h1>없는 검사예요</h1>
        <button type="button" className="button button--primary" onClick={() => navigate('/')}>
          처음으로
        </button>
        </div>
      </div>
    )
  }

  // 영역까지 골랐으면 후속 서술로 이어져요.
  if (saved.lowestArea) {
    return (
      <div className="page page--result">
        <TopBar title="이어서 이야기하기" />

        <div className="tab-panel">
          <section className="card">
            <p className="area-name">{saved.lowestArea}</p>
            <p className="stage-message">
              여기가 제일 낮게 나왔구나. 이 부분을 조금 더 들여다보자.
            </p>
          </section>

          {/* TODO: 선택한 영역으로 자체 서술 문항을 라우팅해 후속 대화를 이어가요. (CLAUDE.md §6)
              영역↔자체 문항 매핑이 아직 없어서 이 단계는 자리만 잡아둡니다. */}
          <section className="card card--muted">
            <p className="hint">
              이 영역에 이어붙일 후속 문항은 아직 준비 중이에요.
            </p>
          </section>

          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => persist({ ...saved, lowestArea: null })}
          >
            영역 다시 고르기
          </button>
          <RestartButton
            label="검사 처음부터 다시 하기"
            title="검사를 다시 할까요?"
            description="지금까지의 응답과 받아둔 결과표가 지워지고 1번 문항부터 다시 시작해요. 이미 만든 결과표는 커리어넷에 남아 있지만 여기서는 다시 열 수 없어요."
            confirmLabel="다시 하기"
            onConfirm={restartInspect}
          />
        </div>
      </div>
    )
  }

  if (saved.reportUrl) {
    return (
      <div className="page page--result">
        <TopBar title="검사 결과" />

        <AreaAskback
          q={q}
          reportUrl={saved.reportUrl}
          onPick={(area) => persist({ ...saved, lowestArea: area })}
        />

        <div className="tab-panel">
          <RestartButton
            label="검사 처음부터 다시 하기"
            title="검사를 다시 할까요?"
            description="지금까지의 응답과 받아둔 결과표가 지워지고 1번 문항부터 다시 시작해요."
            confirmLabel="다시 하기"
            onConfirm={restartInspect}
          />
        </div>
      </div>
    )
  }

  const meta = inspectMeta(q)

  // 결과표가 안 만들어지는 검사는 **문항을 풀기 전에** 알려요.
  // 35문항을 다 답한 뒤에 실패를 알게 되는 게 가장 나쁩니다.
  if (meta?.reportOutage && !dismissedOutage) {
    return (
      <div className="page page--flow">
        <TopBar title={meta.title} />
        <div className="tab-panel">
          <section className="card card--muted">
            <h2 className="section-title">지금은 결과표를 받을 수 없어요</h2>
            <p className="stage-message">{meta.reportOutage}</p>
            <p className="hint">
              문항은 정상이라 답변은 저장돼요. 나중에 복구되면 이어서 결과표를 만들 수 있어요.
            </p>
          </section>

          <button
            type="button"
            className="button button--primary button--block"
            onClick={() => navigate('/inspect/6')}
          >
            대신 직업가치관검사 하기
          </button>

          <button
            type="button"
            className="button button--ghost button--block"
            onClick={() => setDismissedOutage(true)}
          >
            그래도 이 검사 진행하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* key를 바꿔 진행 상태를 비운 채로 다시 마운트해요. */}
      <InspectFlow
        key={resetSeq}
        q={q}
        title={meta?.title ?? '검사'}
        trgetSe={meta?.trgetSe ?? '100208'}
        gender="100323"
        onReport={(url) => persist({ ...saved, reportUrl: url })}
      />
      <div className="flow-restart">
        <RestartButton
          label="처음부터 다시 하기"
          title="검사를 처음부터 할까요?"
          description="지금까지 답한 문항이 지워지고 1번부터 다시 시작해요."
          confirmLabel="다시 하기"
          variant="text"
          onConfirm={() => {
            restartInspect()
            setResetSeq((value) => value + 1)
          }}
        />
      </div>
    </>
  )
}
