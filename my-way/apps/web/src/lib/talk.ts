import type { TalkTurn } from '@/lib/talkApi'

/**
 * 대화 저장.
 *
 * 자유 서술이 그대로 들어가므로 **콘솔·에러 리포팅으로 내보내지 마세요.**
 * (CLAUDE.md §2.8)
 */

export const TALK_KEY = 'talk'

export interface TalkState {
  characterId: string
  turns: TalkTurn[]
}

export const EMPTY_TALK: TalkState = { characterId: '', turns: [] }

/** 사용자가 몇 번 말했는지. 턴 수는 **사용자 발화 기준**이에요. */
export function spokenTurns(turns: TalkTurn[]): number {
  return turns.filter((turn) => turn.role === 'user').length
}

/**
 * 결과지 저장.
 *
 * `formId` 를 **반드시 함께 저장합니다.** 양식이 무작위라 저장을 안 하면 다시 열
 * 때마다 모양이 바뀌고, 이미지로 저장해둔 것과 화면이 달라져요.
 */
export const NOTE_KEY = 'note'

export interface NoteState {
  characterId: string
  formId: string
  lines: string[]
  from: string
}

export const EMPTY_NOTE: NoteState = { characterId: '', formId: '', lines: [], from: '' }
