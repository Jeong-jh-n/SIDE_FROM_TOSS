const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 캐릭터 대화 클라이언트.
 *
 * **서버는 대화를 들고 있지 않아요.** 매 턴 전체를 보내고 한 마디를 받아옵니다.
 * 저장은 기기 안에서만 일어나요. (CLAUDE.md §2.8)
 *
 * 실패하면 조용히 빈손을 돌려줍니다 — AI가 안 되더라도 화면이 깨지면 안 돼요.
 */

export interface Character {
  id: string
  name: string
  blurb: string
  /** 첫 마디. 모델을 부르지 않고 그대로 씁니다. */
  opening: string
}

export interface TalkTurn {
  role: 'user' | 'character'
  text: string
}

interface CharactersResponse {
  characters?: Character[]
  minTurns?: number
  maxTurns?: number
}

export interface CharacterList {
  characters: Character[]
  minTurns: number
  maxTurns: number
}

/** 서버가 안 되면 빈 목록. 화면이 "지금은 이야기할 수 없어요" 를 띄웁니다. */
export async function fetchCharacters(signal?: AbortSignal): Promise<CharacterList> {
  try {
    const res = await fetch(`${BASE}/api/ai/characters`, { signal })
    if (!res.ok) return { characters: [], minTurns: 5, maxTurns: 10 }

    const body = (await res.json()) as CharactersResponse
    return {
      characters: body.characters ?? [],
      minTurns: body.minTurns ?? 5,
      maxTurns: body.maxTurns ?? 10,
    }
  } catch {
    return { characters: [], minTurns: 5, maxTurns: 10 }
  }
}

export interface TalkReply {
  /** 쓸 만한 답이 왔는지. */
  available: boolean
  reply: string | null
  /** 'risk' 면 자살·자해 신호라 모델을 부르지 않았어요. 상담 자원을 안내합니다. */
  blocked?: 'risk'
}

export async function sendTurn(
  characterId: string,
  turns: TalkTurn[],
  signal?: AbortSignal,
): Promise<TalkReply> {
  try {
    const res = await fetch(`${BASE}/api/ai/talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, turns }),
      signal,
    })

    if (!res.ok) return { available: false, reply: null }
    return (await res.json()) as TalkReply
  } catch {
    return { available: false, reply: null }
  }
}
