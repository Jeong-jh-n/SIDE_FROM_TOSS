import { describe, expect, it } from 'vitest'
import { behavior } from '@/lib/content'
import { countByGroup, evaluateBehavior, findUnimplementedRules } from './behaviorRules'

/**
 * JSON의 `when` 서술과 코드의 판정식이 어긋나지 않는지 지키는 테스트예요.
 * 규칙이 JSON에 추가되면 여기서 먼저 실패합니다.
 */

const ids = (group: string) => behavior.items.filter((i) => i.group === group).map((i) => i.id)

describe('규칙 커버리지', () => {
  it('JSON의 모든 규칙에 판정식이 있다', () => {
    expect(findUnimplementedRules()).toEqual([])
  })

  it('maxDisplay 는 JSON에서 읽는다', () => {
    expect(behavior.bottlenecks.maxDisplay).toBe(2)
  })
})

describe('단계 판정 — 하나만 나온다', () => {
  it('아무것도 체크 안 하면 "시작 전"', () => {
    expect(evaluateBehavior([]).stage?.stage).toBe('시작 전')
  })

  it('A만 체크하면 "탐색기"', () => {
    expect(evaluateBehavior([ids('A')[0]]).stage?.stage).toBe('탐색기')
  })

  it('D만 체크하면 "준비기"', () => {
    expect(evaluateBehavior([ids('D')[0]]).stage?.stage).toBe('준비기')
  })

  it('E만 체크해도 "준비기"', () => {
    expect(evaluateBehavior([ids('E')[0]]).stage?.stage).toBe('준비기')
  })

  it('B가 하나라도 있으면 "실행기" — 다른 그룹과 무관', () => {
    expect(evaluateBehavior([ids('A')[0], ids('B')[0]]).stage?.stage).toBe('실행기')
  })

  it('C만 체크하면 A·B·D·E가 없으므로 "시작 전"', () => {
    expect(evaluateBehavior([ids('C')[0]]).stage?.stage).toBe('시작 전')
  })
})

describe('병목 판정', () => {
  it('stalled — F1 미체크인데 다른 활동이 있으면 발동', () => {
    const result = evaluateBehavior([ids('A')[0]])
    expect(result.bottlenecks.map((b) => b.id)).toContain('stalled')
  })

  it('stalled — F1을 체크하면 발동하지 않는다', () => {
    const result = evaluateBehavior([ids('A')[0], 'F1'])
    expect(result.bottlenecks.map((b) => b.id)).not.toContain('stalled')
  })

  it('stalled — 아무 활동도 없으면 발동하지 않는다', () => {
    expect(evaluateBehavior([]).bottlenecks).toEqual([])
  })

  it('ready_not_applying — D+E가 2 이상이고 B가 없으면 발동', () => {
    const result = evaluateBehavior([ids('D')[0], ids('E')[0], 'F1'])
    expect(result.bottlenecks.map((b) => b.id)).toContain('ready_not_applying')
  })

  it('applying_without_assets — B가 있고 E가 없으면 발동', () => {
    const result = evaluateBehavior([ids('B')[0], 'F1'])
    expect(result.bottlenecks.map((b) => b.id)).toContain('applying_without_assets')
  })

  it('info_rich_prep_poor — A가 2 이상이고 D·E가 0이면 발동', () => {
    const result = evaluateBehavior([ids('A')[0], ids('A')[1], 'F1'])
    expect(result.bottlenecks.map((b) => b.id)).toContain('info_rich_prep_poor')
  })

  it('solo_search — A+B+D+E가 4 이상이고 C가 0이면 발동', () => {
    const checked = [ids('A')[0], ids('A')[1], ids('B')[0], ids('D')[0], 'F1']
    const result = evaluateBehavior(checked)
    expect(result.bottlenecks.map((b) => b.id)).toContain('solo_search')
  })

  it('solo_search — 임계값 3에서는 발동하지 않는다 (JSON note 근거)', () => {
    const checked = [ids('A')[0], ids('A')[1], ids('B')[0], 'F1']
    const result = evaluateBehavior(checked)
    expect(result.bottlenecks.map((b) => b.id)).not.toContain('solo_search')
  })
})

describe('노출 제한', () => {
  it('여러 개가 잡혀도 maxDisplay(2)개까지만 돌려준다', () => {
    // F1 미체크 + A 2개 → stalled, info_rich_prep_poor 등 복수 매칭
    const result = evaluateBehavior([ids('A')[0], ids('A')[1]])
    expect(result.bottlenecks.length).toBeLessThanOrEqual(behavior.bottlenecks.maxDisplay)
  })

  it('priority 오름차순으로 잘라낸다', () => {
    const result = evaluateBehavior([ids('A')[0], ids('A')[1]])
    const priorities = result.bottlenecks.map((b) => b.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
    expect(result.bottlenecks[0]?.id).toBe('stalled') // priority 1
  })
})

describe('집계', () => {
  it('그룹별로 센다', () => {
    const counts = countByGroup([ids('A')[0], ids('A')[1], ids('B')[0]])
    expect(counts.A).toBe(2)
    expect(counts.B).toBe(1)
    expect(counts.C).toBe(0)
  })

  it('모르는 id는 무시한다', () => {
    expect(countByGroup(['없는id']).A).toBe(0)
  })
})
