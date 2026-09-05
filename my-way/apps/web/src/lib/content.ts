import raw from '@content/career_content_v1.json'
import type {
  BehaviorData,
  CareerContent,
  NarrativeData,
  TeenData,
  TrackId,
} from '@/types/content'

/**
 * 문항 원본 로더.
 *
 * `data/career_content_v1.json` 이 단일 소스예요. 여기서만 읽고,
 * 문항 텍스트나 규칙을 다른 곳에 복사하지 마세요. (CLAUDE.md §2.6, §9)
 */
export const content = raw as unknown as CareerContent

export const teen: TeenData = content.tracks.teen.data
export const behavior: BehaviorData = content.tracks.jobseeker_behavior.data
export const narrative: NarrativeData = content.tracks.jobseeker_narrative.data

export const TRACK_IDS = ['teen', 'jobseeker_behavior', 'jobseeker_narrative'] as const

export function isTrackId(value: string): value is TrackId {
  return (TRACK_IDS as readonly string[]).includes(value)
}

export function trackMeta(trackId: TrackId) {
  return content.tracks[trackId]
}

/** 트랙 A 문항을 `recommendedOrder` 순서로 돌려줘요. */
export function teenItemsInOrder() {
  const byId = new Map(teen.items.map((item) => [item.id, item]))
  return teen.recommendedOrder.map((id) => byId.get(id)).filter((item) => item !== undefined)
}

/**
 * 트랙 C 문항을 `flow.recommendedOrder` 순서로 돌려줘요.
 * `flow.dependencies`를 위반하면 예외를 던져요 — N11은 N6·N7·N9 뒤에 와야 해요.
 */
export function narrativeItemsInOrder() {
  const order = narrative.flow.recommendedOrder
  const position = new Map(order.map((id, index) => [id, index]))

  for (const dependency of narrative.flow.dependencies) {
    const target = position.get(dependency.item)
    if (target === undefined) continue

    for (const required of dependency.requires) {
      const source = position.get(required)
      if (source !== undefined && source > target) {
        throw new Error(
          `flow.dependencies 위반: ${dependency.item}이(가) ${required}보다 앞에 있어요`,
        )
      }
    }
  }

  const byId = new Map(narrative.items.map((item) => [item.id, item]))
  return order.map((id) => byId.get(id)).filter((item) => item !== undefined)
}

/** 트랙 B 문항. `separate: true`(F1)는 따로 떼어 제시해요. */
export function behaviorItemGroups() {
  return {
    main: behavior.items.filter((item) => item.separate !== true),
    separate: behavior.items.filter((item) => item.separate === true),
  }
}
