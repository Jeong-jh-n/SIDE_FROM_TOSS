/**
 * 검사번호별 메타데이터.
 *
 * 화이트리스트의 최종 판정은 백엔드가 하고(`ALLOWED_TESTS`), 여기는 화면용 정보예요.
 * 제목·대상코드를 화면 곳곳에 하드코딩하지 않으려고 한곳에 모읍니다.
 */

export interface InspectMeta {
  q: number
  title: string
  /** 대상코드 (CLAUDE.md §4) */
  trgetSe: string
  /**
   * 결과표의 하위영역 목록. 영역 되묻기에 씁니다.
   * 확인되지 않은 검사는 null이고, 그때는 되묻기 단계를 건너뛰어요. (CLAUDE.md §6, §14)
   */
  areas: readonly string[] | null
  /**
   * 커리어넷 쪽에서 `report`가 실패하는 검사.
   * 값이 있으면 사용자에게 **문항을 풀기 전에** 알려요.
   *
   * 2026-08-31 현재 해당하는 검사는 없습니다. q=8 이 여기 있었지만 원인이
   * 커리어넷 장애가 아니라 우리 answers 형식이었어요. 장치는 남겨 둡니다.
   */
  reportOutage?: string
}

/** 진로개발준비도(q=8)의 6개 영역. 결과표에서 확인된 값이에요. */
export const READY_AREAS = [
  '자기이해',
  '전공 직업지식',
  '진로결정확신도',
  '의사결정자신감',
  '관계활용자신감',
  '구직준비도',
] as const

export const INSPECT_TESTS: Record<number, InspectMeta> = {
  6: {
    q: 6,
    title: '직업가치관검사',
    trgetSe: '100208',
    // TODO(probe): 결과표를 한 번 열어 영역 목록을 확인하면 되묻기를 켤 수 있어요.
    areas: null,
  },
  8: {
    q: 8,
    title: '진로개발준비도',
    trgetSe: '100208',
    areas: READY_AREAS,
    // 2026-08-28 에 HTTP 500 으로 막혀 있던 검사예요. 커리어넷 장애로 봤지만
    // 원인은 우리 쪽 answers 형식이었습니다. q=8 은 "1=4 2=4" 가 아니라
    // "4,4,..." 만 받아요. 2026-08-31 에 고치고 실제 호출로 확인했습니다.
    // (`lib/answers.ts` 의 ANSWERS_FORMAT 참조)
  },
  25: {
    q: 25,
    title: '직업가치관검사',
    trgetSe: '100207',
    // TODO(probe): 결과표를 한 번 열어 영역 목록을 확인하면 되묻기를 켤 수 있어요.
    areas: null,
  },
  36: {
    q: 36,
    title: '진로성숙도검사',
    trgetSe: '100207',
    areas: null,
  },
}

/**
 * 트랙별로 안내할 검사.
 *
 * **중·고등학생 트랙은 고등학생 기준(25·36)으로 갑니다.** 중학생용(24·35)은
 * 학년을 따로 받아야 갈라낼 수 있는데, 그 입력을 두지 않기로 했어요.
 * 대상코드도 고등학생(`100207`) 하나로 고정됩니다.
 */
export const TRACK_TESTS: Record<string, number[]> = {
  teen: [25, 36],
  jobseeker_behavior: [6, 8],
  jobseeker_narrative: [6, 8],
}

export function inspectMeta(q: number): InspectMeta | undefined {
  return INSPECT_TESTS[q]
}

export function areasFor(q: number): readonly string[] | null {
  return INSPECT_TESTS[q]?.areas ?? null
}
