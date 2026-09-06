import { useNavigate } from 'react-router'
import { TopBar } from '@/features/shared/TopBar'

/**
 * 연령 기준에 못 미치는 게 **확인된** 경우.
 *
 * 확인이 안 되는 환경에서는 뜨지 않아요. 안드로이드·구버전에서도 막으면 대부분의
 * 사용자가 못 들어옵니다. (`lib/ageGate.ts`)
 *
 * 대화만 막고 **명함까지 만든 것은 그대로 남깁니다.** 여기까지 온 게 사라지면
 * 왜 막혔는지보다 "내 것이 없어졌다" 가 먼저 보여요.
 */
export function AgeBlocked() {
  const navigate = useNavigate()

  return (
    <div className="page page--result">
      <TopBar title="" />

      <div className="tab-panel">
        <section className="card">
          <h1 className="section-title">이 기능은 조금 더 자란 뒤에 만나요</h1>
          <p className="stage-message">
            캐릭터와 나누는 이야기는 만 19세 이상만 이용할 수 있어요. 지금까지 만든 명함은
            그대로 있어요.
          </p>
        </section>

        <button
          type="button"
          className="button button--primary button--block"
          onClick={() => navigate('/card')}
        >
          명함 보러 가기
        </button>
      </div>
    </div>
  )
}
