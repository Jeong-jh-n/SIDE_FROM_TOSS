import { teen } from '@/lib/content'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { anyRiskSignal } from '@/lib/safety'
import { AiFeedback } from '@/features/shared/AiFeedback'
import type { FeedbackEntry } from '@/lib/aiApi'

/**
 * 트랙 A 결과 — 영역별로 **사용자가 한 말을 묶어** 보여줘요.
 *
 * 판정 문구를 넣지 않아요. 우리가 하는 건 정리뿐이고 해석은 하지 않습니다. (CLAUDE.md §7)
 * 문항의 `cues`(상/중/하)는 라벨링용이라 화면에 절대 노출하지 않아요.
 */
export function TeenResult({ answers }: { answers: FlowAnswer[] }) {
  const byKey = new Map(answers.map((answer) => [answer.key, answer]))

  // 도메인 → 영역 → 응답. 순서는 JSON의 domains·areas 순서를 따라요.
  const sections = teen.domains.map((domain) => {
    const areas = teen.areas
      .filter((area) => area.domain === domain.id)
      .map((area) => {
        const entries = teen.items
          .filter((item) => item.areaId === area.id)
          .map((item) => ({ item, answer: byKey.get(String(item.id)) }))
          .filter((entry) => entry.answer && !entry.answer.skipped && entry.answer.text.trim())
        return { area, entries }
      })
      .filter((group) => group.entries.length > 0)

    return { domain, areas }
  })

  const spoken = sections.filter((section) => section.areas.length > 0)

  const touchedSupport = teen.items.some((item) => {
    if (!item.supportFlag) return false
    const answer = byKey.get(String(item.id))
    return Boolean(answer && !answer.skipped && answer.text.trim())
  })

  // 문항 플래그와 무관하게 **내용**에 위험 신호가 있으면 안내해요. (CLAUDE.md §8)
  const risky = anyRiskSignal(answers.filter((a) => !a.skipped).map((a) => a.text))

  const answeredCount = answers.filter((a) => !a.skipped && a.text.trim()).length

  // supportFlag 문항(Q7·Q23)은 피드백 입력에서 빼요. 그 응답을 근거로
  // 부정적 판단 문구를 만들면 안 됩니다. (CLAUDE.md §8)
  const feedbackEntries: FeedbackEntry[] = teen.items
    .filter((item) => !item.supportFlag)
    .map((item) => ({ item, answer: byKey.get(String(item.id)) }))
    .filter((entry) => entry.answer && !entry.answer.skipped && entry.answer.text.trim())
    .map((entry) => ({ question: entry.item.prompt, answer: entry.answer!.text }))

  return (
    <div className="tab-panel">
      <section className="card">
        <p className="stage-message">
          네가 한 말을 주제별로 모아봤어. 여기 있는 건 전부 네가 직접 한 말이야.
        </p>
        <p className="note-meta">
          {teen.items.length}개 중 {answeredCount}개에 답했어.
        </p>
      </section>

      {spoken.length === 0 && (
        <section className="card">
          <p className="stage-message">아직 모인 이야기가 없어. 다시 해볼래?</p>
        </section>
      )}

      {spoken.map(({ domain, areas }) => (
        <section className="card" key={domain.id}>
          <h2 className="section-title">{domain.name}</h2>

          {areas.map(({ area, entries }) => (
            <div className="area-block" key={area.id}>
              <p className="area-name">{area.name}</p>
              {entries.map(({ item, answer }) => (
                <div className="quote" key={item.id}>
                  <p className="quote-prompt">{item.prompt}</p>
                  <p className="quote-text">{answer?.text}</p>
                  {answer?.probeText && <p className="quote-text quote-text--sub">{answer.probeText}</p>}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      {/* 지지체계·진로장벽 문항에 답했으면 상담 자원을 함께 안내해요. (CLAUDE.md §8) */}
      <AiFeedback entries={feedbackEntries} track="teen" />

      {(touchedSupport || risky) && <SupportNotice />}
    </div>
  )
}
