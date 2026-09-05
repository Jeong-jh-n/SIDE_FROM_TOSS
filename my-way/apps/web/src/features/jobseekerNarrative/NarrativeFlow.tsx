import { narrative, narrativeItemsInOrder } from '@/lib/content'
import { shouldFollowup } from '@/lib/followup'
import { fetchFollowup } from '@/lib/aiApi'
import { QuestionFlow } from '@/features/shared/QuestionFlow'
import type { FlowAnswer, FlowItem } from '@/features/shared/QuestionFlow'

export const NARRATIVE_STORAGE_KEY = 'track:jobseeker_narrative'

/** 자존감을 건드릴 수 있는 문항. 상담 자원 안내를 붙여요. (JSON caveats, CLAUDE.md §8) */
const SENSITIVE_IDS = new Set(['N4', 'N7', 'N12'])

/**
 * 트랙 C — 12문항 문답. **해요체**라 톤이 A·B와 달라요.
 *
 * 순서는 `flow.recommendedOrder`이고, `flow.dependencies`(N11은 N6·N7·N9 뒤)는
 * 로더가 검증해요. 응답이 얇으면 `probeIfThin`을 던집니다. (CLAUDE.md §9)
 *
 * **AI 보조질문도 해요체예요.** 진로 LoRA는 고등학생 말투를 학습해서 이 트랙과
 * 어긋납니다. 그래서 `'jobseeker'` 트랙으로 부르면 서버가 **어댑터를 끄고 베이스
 * 모델로** 생성해요. 문항 텍스트(§2.6 수정 금지)를 건드리지 않고 어투를 맞춥니다.
 */
/** 트랙 C 는 취준생 프로필(해요체 + 베이스 모델)로 부릅니다. */
const narrativeFollowup = (question: string, answer: string, signal: AbortSignal) =>
  fetchFollowup(question, answer, signal, 'jobseeker')

export function NarrativeFlow({ onDone }: { onDone: (answers: FlowAnswer[]) => void }) {
  const items: FlowItem[] = narrativeItemsInOrder().map((item) => ({
    key: item.id,
    prompt: item.prompt,
    probe: item.probeIfThin,
    supportFlag: SENSITIVE_IDS.has(item.id),
  }))

  return (
    <QuestionFlow
      title={narrative.title}
      items={items}
      storageKey={NARRATIVE_STORAGE_KEY}
      placeholder="편하게 적어주세요"
      skipLabel="건너뛸게요"
      doneLabel="정리한 내용 보기"
      shouldProbe={shouldFollowup}
      aiFollowup={narrativeFollowup}
      onDone={onDone}
    />
  )
}
