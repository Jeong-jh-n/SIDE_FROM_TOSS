import { narrative } from '@/lib/content'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { anyRiskSignal } from '@/lib/safety'
import { AiFeedback } from '@/features/shared/AiFeedback'
import type { FeedbackEntry } from '@/lib/aiApi'

/**
 * 정서적 신호 문항. (CLAUDE.md §8 — 트랙 C N4 졸업 공백 / N7·N12 실패·부족함)
 *
 * 두 가지에 씁니다.
 * 1. 응답이 있으면 상담 자원을 안내한다
 * 2. **AI 피드백 입력에서 제외한다** — 이 응답을 근거로 부정적 판단을 만들면 안 돼요
 *
 * 통합 화면(`SummaryRoute`)도 같은 기준을 써야 해서 내보냅니다.
 */
export const SENSITIVE_IDS = new Set(['N4', 'N7', 'N12'])

/**
 * 트랙 C 결과 — `coverLetterMap` 기준으로 주제별 성찰 자료를 묶어요.
 *
 * **자기소개서가 아니에요.** 여기 모인 건 사용자가 한 말을 주제별로 정리한 것이고,
 * 그대로 자소서에 옮겨 쓸 수 있는 글이 아닙니다. 자기 생각을 다시 들여다보는 재료예요.
 * 대신 써주는 것도 하지 않습니다. (CLAUDE.md §7, JSON caveats)
 */
export function NarrativeResult({ answers }: { answers: FlowAnswer[] }) {
  const byKey = new Map(answers.map((answer) => [answer.key, answer]))
  const itemById = new Map(narrative.items.map((item) => [item.id, item]))

  // coverLetterMap 에는 note 키가 섞여 있어요. 배열인 항목만 씁니다.
  const buckets = Object.entries(narrative.coverLetterMap)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    .map(([label, ids]) => ({
      label,
      entries: ids
        .map((id) => ({ item: itemById.get(id), answer: byKey.get(id) }))
        .filter(
          (entry) =>
            entry.item && entry.answer && !entry.answer.skipped && entry.answer.text.trim(),
        ),
    }))
    .filter((bucket) => bucket.entries.length > 0)

  const touchedSensitive = [...SENSITIVE_IDS].some((id) => {
    const answer = byKey.get(id)
    return Boolean(answer && !answer.skipped && answer.text.trim())
  })

  // 문항 플래그와 무관하게 **내용**에 위험 신호가 있으면 안내해요. (CLAUDE.md §8)
  const risky = anyRiskSignal(answers.filter((a) => !a.skipped).map((a) => a.text))

  const answeredCount = answers.filter((a) => !a.skipped && a.text.trim()).length

  // 정서적 신호 문항(N4·N7·N12)은 피드백 입력에서 빼요. 그 응답을 근거로
  // 부정적 판단 문구를 만들면 안 됩니다. (CLAUDE.md §8)
  const feedbackEntries: FeedbackEntry[] = narrative.items
    .filter((item) => !SENSITIVE_IDS.has(item.id))
    .map((item) => ({ item, answer: byKey.get(item.id) }))
    .filter((entry) => entry.answer && !entry.answer.skipped && entry.answer.text.trim())
    .map((entry) => ({ question: entry.item.prompt, answer: entry.answer!.text }))

  return (
    <div className="tab-panel">
      <section className="card">
        <p className="stage-message">
          이야기해주신 내용을 주제별로 묶었어요. 여기 있는 문장은 전부 직접 하신 말이에요.
          그대로 어딘가에 옮겨 쓰는 글이 아니라, 생각을 다시 들여다보는 자료로 봐주세요.
        </p>
        <p className="note-meta">
          {narrative.items.length}개 중 {answeredCount}개에 답하셨어요.
        </p>
      </section>

      {buckets.length === 0 && (
        <section className="card">
          <p className="stage-message">아직 모인 내용이 없어요.</p>
        </section>
      )}

      {buckets.map((bucket) => (
        <section className="card" key={bucket.label}>
          <h2 className="section-title">{bucket.label}</h2>
          {bucket.entries.map(({ item, answer }) => (
            <div className="quote" key={item?.id}>
              <p className="quote-prompt">{item?.prompt}</p>
              <p className="quote-text">{answer?.text}</p>
              {answer?.probeText && (
                <p className="quote-text quote-text--sub">{answer.probeText}</p>
              )}
            </div>
          ))}
        </section>
      ))}

      <AiFeedback entries={feedbackEntries} track="jobseeker" />

      {(touchedSensitive || risky) && <SupportNotice />}
    </div>
  )
}
