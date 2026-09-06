/**
 * 사용자 응답 저장.
 *
 * 원패턴이라 저장소가 하나예요. 예전에는 트랙마다 키가 따로 있었는데
 * (`track:teen`, `track:jobseeker_narrative`) 트랙 구분이 없어지면서 합쳤습니다.
 *
 * 자유 서술이 들어가므로 **콘솔·에러 리포팅으로 내보내지 마세요.** (CLAUDE.md §2.8)
 */

export const RESPONSES_KEY = 'responses'

export interface FlowAnswer {
  /** 문항 id. */
  key: string
  text: string
  /** 건너뛰었는지. 빈 응답과 구분해요 — 건너뛴 것도 사용자 행동입니다. */
  skipped: boolean
}

export interface ResponsesState {
  answers: FlowAnswer[]
}

export const EMPTY_RESPONSES: ResponsesState = { answers: [] }
