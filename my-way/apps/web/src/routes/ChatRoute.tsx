import { useNavigate, useParams } from 'react-router'
import { isTrackId } from '@/lib/content'
import { saveState } from '@/lib/storage'
import { TopBar } from '@/features/shared/TopBar'
import { BehaviorChecklist } from '@/features/jobseekerBehavior/BehaviorChecklist'
import { TeenFlow } from '@/features/teen/TeenFlow'
import { NarrativeFlow } from '@/features/jobseekerNarrative/NarrativeFlow'

/**
 * `/chat/:track` — 자체 문항 문답.
 *
 * 트랙마다 형식이 달라요. B는 체크리스트 한 화면, A·C는 문답형입니다. (CLAUDE.md §9)
 */
export function ChatRoute() {
  const { track } = useParams<{ track: string }>()
  const navigate = useNavigate()

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
    return (
      <BehaviorChecklist
        onDone={(checked) => {
          saveState('track:jobseeker_behavior', { checked, submitted: true })
          navigate('/result/jobseeker_behavior')
        }}
      />
    )
  }

  if (track === 'teen') {
    return <TeenFlow onDone={() => navigate('/result/teen')} />
  }

  return <NarrativeFlow onDone={() => navigate('/result/jobseeker_narrative')} />
}
