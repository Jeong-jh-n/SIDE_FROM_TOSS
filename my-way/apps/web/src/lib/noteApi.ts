import type { TalkTurn } from '@/lib/talkApi'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 대화를 메모 몇 줄로 정리해 받아와요.
 *
 * 실패하면 빈 목록입니다. AI 가 안 되더라도 화면이 깨지면 안 돼요.
 */

export interface NoteResult {
  available: boolean
  lines: string[]
  /** 누가 남긴 메모인지. 서명에 씁니다. */
  from?: string
}

export async function fetchNote(
  characterId: string,
  turns: TalkTurn[],
  signal?: AbortSignal,
): Promise<NoteResult> {
  try {
    const res = await fetch(`${BASE}/api/ai/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, turns }),
      signal,
    })

    if (!res.ok) return { available: false, lines: [] }
    return (await res.json()) as NoteResult
  } catch {
    return { available: false, lines: [] }
  }
}
