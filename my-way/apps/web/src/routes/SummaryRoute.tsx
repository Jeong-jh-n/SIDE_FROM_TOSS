import { useNavigate } from 'react-router'
import { loadState } from '@/lib/storage'
import { narrative } from '@/lib/content'
import { evaluateBehavior } from '@/features/jobseekerBehavior/behaviorRules'
import { InspectResults } from '@/features/inspect/InspectResults'
import { TRACK_TESTS } from '@/lib/inspectMeta'
import { SupportNotice } from '@/features/shared/SupportNotice'
import { anyRiskSignal } from '@/lib/safety'
import { TopBar } from '@/features/shared/TopBar'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { NARRATIVE_STORAGE_KEY } from '@/features/jobseekerNarrative/NarrativeFlow'
import { SENSITIVE_IDS } from '@/features/jobseekerNarrative/NarrativeResult'
import { AiFeedback } from '@/features/shared/AiFeedback'
import type { FeedbackEntry } from '@/lib/aiApi'

/**
 * 대학생·취준생 통합 결과 — 마지막에 세 갈래를 나란히 놓아요.
 *
 * ## 합치되 섞지 않습니다
 *
 * 세 조각의 출처가 전부 다릅니다.
 *
 * | 조각 | 출처 | 성격 |
 * |---|---|---|
 * | 병목 | 트랙 B 체크리스트 | 우리 규칙 판정 (행동) |
 * | 서술 | 트랙 C 응답 | 사용자가 한 말 그대로 |
 * | 최저 영역 | 커리어넷 결과표 → 되묻기 | 공인 검사 결과 |
 *
 * **더해서 하나의 점수로 만들지 않아요.** 단위가 다르고, 자체 문항으로 점수를 내는 건
 * 금지돼 있습니다. (CLAUDE.md §2.3) 나란히 놓고 해석은 사용자에게 맡깁니다.
 *
 * **인과로 잇지도 않아요.** "준비도가 낮으니 불안하다" 같은 문장은 만들지 않습니다.
 * 진로개발준비도는 준비도 척도이지 불안 척도가 아니라 구인이 다릅니다.
 *
 * 공인 검사 쪽은 배지로 시각적으로 구분합니다. (CLAUDE.md §7)
 */

/** 통합 화면에서 인용할 서술 문항. 걸림돌·부족감을 직접 묻는 것들이에요. */
const FRICTION_ITEMS = ['N12', 'N7'] as const

interface InspectSaved {
  reportUrl: string | null
  lowestArea: string | null
}

export function SummaryRoute() {
  const navigate = useNavigate()

  const { checked } = loadState<{ checked: string[] }>('track:jobseeker_behavior', {
    checked: [],
  })
  const { answers } = loadState<{ answers: FlowAnswer[] }>(NARRATIVE_STORAGE_KEY, {
    answers: [],
  })

  const { stage, bottlenecks } = evaluateBehavior(checked)
  const hasStalled = bottlenecks.some((rule) => rule.id === 'stalled')

  const byKey = new Map(answers.map((answer) => [answer.key, answer]))
  const frictions = FRICTION_ITEMS.map((id) => ({
    prompt: narrative.items.find((item) => item.id === id)?.prompt,
    answer: byKey.get(id),
  })).filter((entry) => entry.prompt && entry.answer && !entry.answer.skipped && entry.answer.text.trim())

  /**
   * 상담 자원 안내 조건. (CLAUDE.md §8)
   *
   * `stalled` 병목뿐 아니라 **정서 신호 문항에 답한 경우도 포함**합니다.
   * 이 화면은 N7·N12 응답을 직접 인용하므로, 인용만 하고 안내를 빠뜨리면 안 돼요.
   */
  const touchedSensitive = [...SENSITIVE_IDS].some((id) => {
    const answer = byKey.get(id)
    return Boolean(answer && !answer.skipped && answer.text.trim())
  })

  // 문항 플래그와 무관하게 **내용**에 위험 신호가 있으면 안내해요. (CLAUDE.md §8)
  const risky = anyRiskSignal(answers.filter((a) => !a.skipped).map((a) => a.text))

  // AI 피드백 입력에서 정서 신호 문항은 빼요. (CLAUDE.md §8)
  const feedbackEntries: FeedbackEntry[] = narrative.items
    .filter((item) => !SENSITIVE_IDS.has(item.id))
    .map((item) => ({ item, answer: byKey.get(item.id) }))
    .filter((entry) => entry.answer && !entry.answer.skipped && entry.answer.text.trim())
    .map((entry) => ({ question: entry.item.prompt, answer: entry.answer!.text }))

  // 커리어넷 쪽에서 우리가 가진 건 되묻기로 받은 영역 하나뿐이에요. 점수는 오지 않습니다.
  const lowestAreas = TRACK_TESTS.jobseeker_narrative
    .map((q) => ({
      q,
      saved: loadState<InspectSaved>(`inspect:result:${q}`, { reportUrl: null, lowestArea: null }),
    }))
    .filter((row) => row.saved.lowestArea)

  const nothingYet =
    checked.length === 0 && answers.length === 0 && lowestAreas.length === 0

  if (nothingYet) {
    return (
      <div className="page page--result">
        <TopBar title="정리" />
        <div className="page page--empty">
          <h1>아직 모인 게 없어요</h1>
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate('/chat/jobseeker_behavior')}
          >
            시작하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--result">
      <TopBar title="지금 걸려 있는 지점" />

      <div className="tab-panel">
        <section className="card">
          <p className="stage-message">
            지금까지 나온 것을 한자리에 모았어요. 서로 더해서 하나의 점수를 내지는 않아요.
            어떻게 읽을지는 본인이 정하면 돼요.
          </p>
        </section>

        {/* 1) 행동 — 트랙 B 규칙 판정 */}
        {(stage || bottlenecks.length > 0) && (
          <section className="card">
            <h2 className="section-title">움직임</h2>
            {stage && <p className="stage-message">{stage.message}</p>}
            {bottlenecks.map((rule) => (
              <p className="stage-message" key={rule.id}>
                <strong>{rule.label}</strong> — {rule.message}
              </p>
            ))}
          </section>
        )}

        {/* 2) 인지 — 사용자가 한 말 그대로 */}
        {frictions.length > 0 && (
          <section className="card">
            <h2 className="section-title">직접 말한 것</h2>
            {frictions.map((entry) => (
              <div className="quote" key={entry.prompt}>
                <p className="quote-prompt">{entry.prompt}</p>
                <p className="quote-text">{entry.answer!.text}</p>
              </div>
            ))}
          </section>
        )}

        {/* 3) 공인 검사 — 되묻기로 받은 영역. 점수는 결과표에 있어요. */}
        {lowestAreas.length > 0 && (
          <section className="card card--official">
            <p className="official-badge">공인 검사 결과</p>
            <h2 className="section-title">검사에서 낮게 나온 영역</h2>
            {lowestAreas.map(({ q, saved }) => (
              <p className="stage-message" key={q}>
                {saved.lowestArea}
              </p>
            ))}
            <p className="note-meta">
              점수와 해설은 커리어넷 결과표에 있어요. 아래에서 열어볼 수 있어요.
            </p>
          </section>
        )}

        <InspectResults
          tests={TRACK_TESTS.jobseeker_narrative}
          onStart={(q) => navigate(`/inspect/${q}`)}
        />

        {/* 위 내용을 바탕으로 쓴 짧은 코멘트. 없으면 카드가 아예 안 떠요. */}
        <AiFeedback entries={feedbackEntries} track="jobseeker" />

        {/* 장기 무활동이거나 정서 신호 문항에 답했으면 상담 자원을 안내해요. (CLAUDE.md §8) */}
        {(hasStalled || touchedSensitive || risky) && <SupportNotice />}

        <button
          type="button"
          className="button button--ghost button--block"
          onClick={() => navigate('/result/jobseeker_behavior')}
        >
          단계·병목 자세히 보기
        </button>
        <button
          type="button"
          className="button button--ghost button--block"
          onClick={() => navigate('/result/jobseeker_narrative')}
        >
          성찰 자료 자세히 보기
        </button>
        <button
          type="button"
          className="button button--ghost button--block"
          onClick={() => navigate('/card')}
        >
          가상 명함 만들기
        </button>
      </div>
    </div>
  )
}
