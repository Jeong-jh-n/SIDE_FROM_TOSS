import { teen, teenItemsInOrder } from '@/lib/content'
import { shouldFollowup } from '@/lib/followup'
import { fetchFollowup } from '@/lib/aiApi'
import { QuestionFlow } from '@/features/shared/QuestionFlow'
import type { FlowAnswer, FlowItem } from '@/features/shared/QuestionFlow'

export const TEEN_STORAGE_KEY = 'track:teen'

/**
 * 트랙 A — 24문항 문답. 반말 톤이며 문구는 전부 JSON에서 가져와요.
 *
 * 순서는 `recommendedOrder`, 꼬리물기는 `followupPolicy` 조건일 때만 발동해요.
 * `supportFlag` 문항(7, 23)에는 상담 자원 안내가 붙어요. (CLAUDE.md §8, §9)
 */
export function TeenFlow({ onDone }: { onDone: (answers: FlowAnswer[]) => void }) {
  const items: FlowItem[] = teenItemsInOrder().map((item) => ({
    key: String(item.id),
    prompt: item.prompt,
    probe: item.followup,
    supportFlag: item.supportFlag,
  }))

  return (
    <QuestionFlow
      title={teen.tone === '반말' ? '너에 대해 들려줘' : '이야기 정리'}
      items={items}
      storageKey={TEEN_STORAGE_KEY}
      placeholder="편하게 적어줘"
      skipLabel="넘길래"
      doneLabel="정리한 거 보기"
      shouldProbe={shouldFollowup}
      aiFollowup={fetchFollowup}
      onDone={onDone}
    />
  )
}
