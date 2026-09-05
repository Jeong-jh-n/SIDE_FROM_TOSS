import { teen } from '@/lib/content'

/**
 * 꼬리물기 발동 판정.
 *
 * **항상 발동하면 안 돼요.** 응답이 얇을 때만 던집니다. (CLAUDE.md §9)
 * 조건은 `teen.followupPolicy.triggers`에 서술로 들어 있고, 여기서는 그 서술에
 * 대응하는 판정식만 구현해요. 트랙 B와 같은 패턴입니다.
 */

/** JSON 서술 "응답 길이 < 10자" */
const MIN_LENGTH = 10

/** JSON 서술 "'몰라'/'없어'/'그냥' 등 회피 응답" */
const AVOIDANT = ['몰라', '모르', '없어', '없음', '그냥', '글쎄', '딱히']

export type TriggerKind = 'length' | 'avoidant' | 'confidence'

/** 이번 단계에서 구현하지 않는 조건. 분류 모델이 없어 판단할 수 없어요. */
export const DEFERRED_TRIGGERS: TriggerKind[] = ['confidence']

/** JSON의 trigger 서술을 종류로 분류해요. */
export function classifyTrigger(when: string): TriggerKind | 'other' {
  if (when.includes('길이')) return 'length'
  if (when.includes('회피')) return 'avoidant'
  if (when.includes('신뢰도')) return 'confidence'
  return 'other'
}

export function isTooShort(text: string): boolean {
  return text.trim().length < MIN_LENGTH
}

export function isAvoidant(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return true
  return AVOIDANT.some((word) => trimmed.includes(word))
}

/**
 * 응답이 얇은지 판정해요. 하나라도 걸리면 보조질문을 던집니다.
 *
 * TODO: 분류 신뢰도 조건(`신뢰도 < 임계값`)은 분류 모델이 붙은 뒤에 추가해요.
 *       JSON에는 있지만 이번 단계에서는 평가하지 않습니다.
 */
export function shouldFollowup(text: string): boolean {
  return isTooShort(text) || isAvoidant(text)
}

/** JSON의 trigger 중 이번 단계에서 평가되지 않는 것들. 테스트가 이 목록을 지켜요. */
export function unevaluatedTriggers(): string[] {
  return teen.followupPolicy.triggers
    .filter((trigger) => {
      const kind = classifyTrigger(trigger.when)
      if (kind === 'other') return trigger.action !== '미발동 — 다음 문항으로'
      return DEFERRED_TRIGGERS.includes(kind)
    })
    .map((trigger) => trigger.when)
}
