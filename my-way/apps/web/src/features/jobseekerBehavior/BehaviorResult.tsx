import { behavior } from '@/lib/content'
import { evaluateBehavior } from './behaviorRules'
import { SupportNotice } from '@/features/shared/SupportNotice'

/**
 * 트랙 B 결과.
 *
 * 단계 1개와 병목 최대 2개만 보여줘요. 체크 개수를 점수로 환산하지 않고,
 * 개수 자체도 노출하지 않아요. (CLAUDE.md §7)
 * `stalled` 병목은 장기 무활동 신호라 상담 자원 안내를 함께 붙여요. (CLAUDE.md §8)
 */
export function BehaviorResult({
  checked,
  onFollowup,
}: {
  checked: string[]
  onFollowup?: (question: string) => void
}) {
  const { stage, bottlenecks } = evaluateBehavior(checked)
  const hasStalled = bottlenecks.some((rule) => rule.id === 'stalled')

  const itemText = (id: string) => behavior.items.find((item) => item.id === id)?.text ?? id

  return (
    <div className="tab-panel">
      {stage && (
        <section className="card">
          <p className="stage-name">{stage.stage}</p>
          <p className="stage-message">{stage.message}</p>
        </section>
      )}

      {bottlenecks.map((rule) => (
        <section className="card" key={rule.id}>
          <h2 className="bottleneck-label">{rule.label}</h2>
          <p className="stage-message">{rule.message}</p>

          {rule.suggest && rule.suggest.length > 0 && (
            <div className="suggest">
              <p className="suggest-title">이런 걸 해보면 어때</p>
              <ul>
                {rule.suggest.map((id) => (
                  <li key={id}>{itemText(id)}</li>
                ))}
              </ul>
            </div>
          )}

          {rule.followup && onFollowup && (
            <button
              type="button"
              className="button button--ghost button--block"
              onClick={() => onFollowup(rule.followup as string)}
            >
              {rule.followup}
            </button>
          )}
        </section>
      ))}

      {/*
        병목이 없을 때의 문구는 상황에 따라 달라야 해요.
        하나도 체크하지 않았으면 "하던 대로 이어가자"가 위의 '시작 전' 메시지와 정면으로 어긋납니다.
        그 경우엔 JSON의 단계 메시지만 두고 아무것도 덧붙이지 않아요.
      */}
      {bottlenecks.length === 0 && checked.length > 0 && (
        <section className="card">
          <p className="stage-message">지금 특별히 걸리는 지점은 안 보여. 하던 대로 이어가자.</p>
        </section>
      )}

      {hasStalled && <SupportNotice />}
    </div>
  )
}
