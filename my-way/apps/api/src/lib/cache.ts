/**
 * 인메모리 TTL 캐시.
 *
 * 문항은 거의 바뀌지 않아요. 매뉴얼에 "이용량에 따라 사용이 제한될 수 있습니다"라고
 * 명시돼 있어 문항 조회는 반드시 캐시합니다. 이번 단계는 인메모리로 충분해요. (CLAUDE.md §4)
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

export const QUESTIONS_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (entry.expiresAt <= now) {
      this.store.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: T, now = Date.now()): void {
    this.store.set(key, { value, expiresAt: now + this.ttlMs })
  }

  get size(): number {
    return this.store.size
  }
}
