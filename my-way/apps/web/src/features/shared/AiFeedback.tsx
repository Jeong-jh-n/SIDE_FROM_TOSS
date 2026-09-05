import { useEffect, useState } from 'react'
import { fetchFeedback, type AiTrack, type FeedbackEntry } from '@/lib/aiApi'

/**
 * 결과 화면에 붙는 짧은 피드백.
 *
 * ## 정리와 피드백은 구분해서 보여줘요
 *
 * 위쪽 정리는 **사용자가 한 말 그대로**이고, 이 카드만 AI가 쓴 글이에요. 두 출처를
 * 섞으면 자기가 한 말과 기계가 쓴 말을 구분할 수 없어져요. §7 이 커리어넷 결과표와
 * 자체 결과를 시각적으로 구분하라고 한 것과 같은 이유입니다.
 *
 * ## 없으면 없는 대로
 *
 * 추론 서버가 안 떠 있거나, 생성된 글이 §7 금지 표현에 걸리면 `apps/api` 가 통째로
 * 버립니다. 그때는 **이 카드가 아예 나타나지 않아요.** 결과 화면은 그대로 쓸 수 있어야
 * 하니까요.
 *
 * ## 정서적 신호 문항은 빼고 보내요
 *
 * `entries` 를 만들 때 `supportFlag` 문항을 제외하는 건 호출부 책임입니다. 그 응답을
 * 근거로 부정적 판단 문구를 만들면 안 돼요. (CLAUDE.md §8)
 */
export function AiFeedback({ entries, track }: { entries: FeedbackEntry[]; track: AiTrack }) {
  const [feedback, setFeedback] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    void fetchFeedback(entries, track, controller.signal).then((text) => {
      if (controller.signal.aborted) return
      setFeedback(text)
      setLoading(false)
    })

    return () => controller.abort()
    // 결과 화면에 들어온 시점의 응답으로 한 번만 부릅니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <section className="card card--ai">
        <p className="note-meta">읽어보는 중이에요…</p>
      </section>
    )
  }

  if (!feedback) return null

  return (
    <section className="card card--ai">
      <h2 className="section-title">읽고 나서</h2>
      <p className="stage-message">{feedback}</p>
      <p className="note-meta">
        이 문단은 위 내용을 바탕으로 자동으로 쓴 글이에요. 판단이 아니라 참고로 봐주세요.
      </p>
    </section>
  )
}
