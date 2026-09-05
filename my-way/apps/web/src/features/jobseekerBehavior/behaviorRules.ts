import { behavior } from '@/lib/content'
import type { BottleneckRule, StagingRule } from '@/types/content'

/**
 * 트랙 B 결과 산출.
 *
 * 라벨·문구·우선순위·`maxDisplay`·`suggest`는 **전부 JSON에서 읽어요.**
 * 코드에 있는 건 판정식뿐입니다.
 *
 * JSON의 `when`이 자연어 서술("(D + E) ≥ 2 이고 B = 0")이라 그대로 실행할 수 없어서,
 * 규칙 id에 대응하는 판정식을 여기에 둡니다. **JSON의 `when`이 명세이고 이 코드가 구현**이며,
 * 둘이 어긋나지 않는지는 `behaviorRules.test.ts`가 지킵니다.
 * JSON에 규칙이 추가되면 여기에 판정식을 추가해야 하고, 없으면 경고와 함께 무시돼요.
 */

export type GroupId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type GroupCounts = Record<GroupId, number>

export interface BehaviorResult {
  stage: StagingRule | null
  bottlenecks: BottleneckRule[]
  counts: GroupCounts
}

const EMPTY_COUNTS: GroupCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 }

/** 체크된 문항 id를 그룹별 개수로 집계해요. */
export function countByGroup(checkedIds: Iterable<string>): GroupCounts {
  const byId = new Map(behavior.items.map((item) => [item.id, item]))
  const counts: GroupCounts = { ...EMPTY_COUNTS }

  for (const id of checkedIds) {
    const group = byId.get(id)?.group as GroupId | undefined
    if (group && group in counts) counts[group] += 1
  }

  return counts
}

/** `when` 서술에 대응하는 단계 판정식. JSON 순서대로 평가하고 처음 맞는 하나만 씁니다. */
const STAGE_TESTS: Record<string, (c: GroupCounts) => boolean> = {
  // "B에 1개 이상 체크"
  실행기: (c) => c.B >= 1,
  // "B는 없고 (D 또는 E)에 1개 이상 체크"
  준비기: (c) => c.B === 0 && (c.D >= 1 || c.E >= 1),
  // "B·D·E 모두 없고 A에 1개 이상 체크"
  탐색기: (c) => c.B === 0 && c.D === 0 && c.E === 0 && c.A >= 1,
  // "A·B·D·E 모두 없음"
  '시작 전': (c) => c.A === 0 && c.B === 0 && c.D === 0 && c.E === 0,
}

/** `when` 서술에 대응하는 병목 판정식. */
const BOTTLENECK_TESTS: Record<string, (c: GroupCounts, f1: boolean) => boolean> = {
  // "F1 미체크 이고 (A+B+C+D+E) ≥ 1"
  stalled: (c, f1) => !f1 && c.A + c.B + c.C + c.D + c.E >= 1,
  // "(D + E) ≥ 2 이고 B = 0"
  ready_not_applying: (c) => c.D + c.E >= 2 && c.B === 0,
  // "B ≥ 1 이고 E = 0"
  applying_without_assets: (c) => c.B >= 1 && c.E === 0,
  // "A ≥ 2 이고 (D + E) = 0"
  info_rich_prep_poor: (c) => c.A >= 2 && c.D + c.E === 0,
  // "(A + B + D + E) ≥ 4 이고 C = 0"
  solo_search: (c) => c.A + c.B + c.D + c.E >= 4 && c.C === 0,
}

/** 체크리스트 응답으로 단계 1개와 병목(최대 `maxDisplay`개)을 산출해요. */
export function evaluateBehavior(checkedIds: Iterable<string>): BehaviorResult {
  const checked = new Set(checkedIds)
  const counts = countByGroup(checked)
  const f1Checked = checked.has('F1')

  const stage =
    behavior.staging.rules.find((rule) => STAGE_TESTS[rule.stage]?.(counts) === true) ?? null

  const matched = behavior.bottlenecks.rules.filter(
    (rule) => BOTTLENECK_TESTS[rule.id]?.(counts, f1Checked) === true,
  )

  // priority 오름차순으로 정렬한 뒤 maxDisplay 를 넘겨 노출하지 않아요.
  const bottlenecks = [...matched]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, behavior.bottlenecks.maxDisplay)

  return { stage, bottlenecks, counts }
}

/** JSON에 있는데 판정식이 없는 규칙을 찾아요. 테스트와 개발 중 경고에 씁니다. */
export function findUnimplementedRules(): string[] {
  const missingStages = behavior.staging.rules
    .filter((rule) => STAGE_TESTS[rule.stage] === undefined)
    .map((rule) => `staging:${rule.stage}`)

  const missingBottlenecks = behavior.bottlenecks.rules
    .filter((rule) => BOTTLENECK_TESTS[rule.id] === undefined)
    .map((rule) => `bottleneck:${rule.id}`)

  return [...missingStages, ...missingBottlenecks]
}
