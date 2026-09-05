import { loadState } from '@/lib/storage'
import type { FlowAnswer } from '@/features/shared/QuestionFlow'
import { TEEN_STORAGE_KEY } from '@/features/teen/TeenFlow'
import { NARRATIVE_STORAGE_KEY } from '@/features/jobseekerNarrative/NarrativeFlow'

/** 프롬프트 톤과 검사 묶음을 고르는 값. */
export type UserTrack = 'teen' | 'jobseeker'

/**
 * 저장된 답변을 보고 어느 트랙인지 알아내요.
 *
 * 트랙 선택은 홈에서 하지만 그 선택 자체를 저장하지 않습니다. 대신 **어느 문답에
 * 답했는지**로 되짚어요. 명함·검사 목록처럼 트랙 파라미터 없이 들어오는 화면들이
 * 같은 기준을 써야 해서 여기 모아 둡니다.
 *
 * 둘 다 있으면 대학생 쪽을 씁니다. 트랙을 바꿔 진행한 경우인데, 검사 대상이
 * 더 좁은 쪽(대학생·일반)으로 잡는 편이 안전해요.
 */
export function detectTrack(): UserTrack {
  const narrative = loadState<{ answers: FlowAnswer[] }>(NARRATIVE_STORAGE_KEY, {
    answers: [],
  }).answers
  if (narrative.length > 0) return 'jobseeker'

  const behavior = loadState<{ checked: string[] }>('track:jobseeker_behavior', {
    checked: [],
  }).checked
  if (behavior.length > 0) return 'jobseeker'

  const teen = loadState<{ answers: FlowAnswer[] }>(TEEN_STORAGE_KEY, { answers: [] }).answers
  if (teen.length > 0) return 'teen'

  // 아무 답도 없으면 중·고등학생 쪽으로 봐요. 홈에서 첫 번째로 놓인 트랙이에요.
  return 'teen'
}
