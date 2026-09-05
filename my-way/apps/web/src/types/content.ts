/**
 * `data/career_content_v1.json` 의 구조 타입.
 *
 * 이 파일이 문항의 단일 소스예요. 문항 텍스트를 코드로 복사하거나
 * 규칙을 하드코딩하지 마세요. (CLAUDE.md §2.6, §9)
 */

export type TrackId = 'teen' | 'jobseeker_behavior' | 'jobseeker_narrative'

/* ---------- 트랙 A: teen ---------- */

export interface TeenDomain {
  id: string
  name: string
  itemCount: number
}

export interface TeenArea {
  id: number
  domain: string
  name: string
}

export interface TeenItem {
  id: number
  areaId: number
  domain: string
  prompt: string
  followup: string
  basis: string
  /** 라벨링용 채점 기준. 화면에 노출하지 마세요 — 등급 표기가 됩니다. (CLAUDE.md §7) */
  cues: Record<string, string>
  probeType: string
  /** 지지체계 부재·진로장벽 신호. 상담 자원 분기가 필요해요. (CLAUDE.md §8) */
  supportFlag?: boolean
}

export interface FollowupTrigger {
  when: string
  action: string
}

export interface TeenData {
  version: string
  tone: string
  domains: TeenDomain[]
  areas: TeenArea[]
  recommendedOrder: number[]
  items: TeenItem[]
  followupPolicy: {
    mode: string
    note: string
    triggers: FollowupTrigger[]
    modelInput: string
    rationale: string
  }
}

/* ---------- 트랙 B: jobseeker_behavior ---------- */

export interface BehaviorGroup {
  id: string
  name: string
  stage: string
  basis: string
}

export interface BehaviorItem {
  id: string
  group: string
  text: string
  /** F1만 기준 기간이 달라요 (최근 1개월). 분리 제시해야 해요. (CLAUDE.md §9) */
  window?: string
  separate?: boolean
}

export interface StagingRule {
  stage: string
  /** 판정 조건의 서술. 실행 로직은 lib/behaviorRules.ts 참조 */
  when: string
  message: string
}

export interface BottleneckRule {
  id: string
  when: string
  label: string
  message: string
  followup?: string
  suggest?: string[]
  note?: string
  priority: number
}

export interface BehaviorData {
  version: string
  track: string
  title: string
  format: {
    type: string
    prompt: string
    rationale: string
    window: string
    note: string
  }
  groups: BehaviorGroup[]
  items: BehaviorItem[]
  staging: { note: string; rules: StagingRule[] }
  bottlenecks: {
    note: string
    rules: BottleneckRule[]
    maxDisplay: number
    displayNote: string
  }
}

/* ---------- 트랙 C: jobseeker_narrative ---------- */

export interface NarrativeSection {
  id: string
  name: string
  count: number
  basis: string
}

export interface NarrativeItem {
  id: string
  section: string
  area: string
  prompt: string
  followup: string
  basis: string
  goodSignal: string
  /** 응답이 얇을 때 던지는 보조질문 */
  probeIfThin: string
  /** 자소서 항목 이름 하나 (배열 아님) */
  usedIn: string
}

export interface NarrativeData {
  version: string
  track: string
  title: string
  tone: string
  sections: NarrativeSection[]
  /** 응답을 자소서 항목별로 묶는 매핑. 이 트랙의 핵심 산출물 */
  coverLetterMap: Record<string, string[] | string>
  items: NarrativeItem[]
  flow: {
    recommendedOrder: string[]
    note: string
    dependencies: { item: string; requires: string[]; reason: string }[]
  }
}

/* ---------- 최상위 ---------- */

export interface TrackMeta<TData> {
  id: string
  name: string
  tone: string
  itemCount: number
  purpose: string
  measurement: string
  source: string
  data: TData
}

export interface CareerContent {
  version: string
  created: string
  project: string
  tracks: {
    teen: TrackMeta<TeenData>
    jobseeker_behavior: TrackMeta<BehaviorData>
    jobseeker_narrative: TrackMeta<NarrativeData>
  }
}
