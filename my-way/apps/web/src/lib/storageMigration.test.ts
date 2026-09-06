import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 오리진이 바뀌어도 저장한 게 살아남는지.
 *
 * SDK 3.1.1 이상으로 올리면 웹뷰 오리진이 바뀌고 **이전 오리진의 localStorage 는
 * 읽을 방법이 없습니다.** 명함·결과지 저장이 여기에 얹히는 중이라, 실수하면
 * 사용자 데이터가 통째로 사라져요. 그래서 시나리오별로 못 박아 둡니다.
 */

/** 네이티브 저장소 흉내. 오리진과 무관하게 살아남는 쪽이에요. */
const nativeStore = new Map<string, string>()
let available = true

vi.mock('@/lib/nativeStorage', () => ({
  nativeAvailable: () => available,
  nativeGet: async (key: string) => (available ? (nativeStore.get(key) ?? null) : null),
  nativeSet: (key: string, value: string) => {
    if (available) nativeStore.set(key, value)
  },
  nativeRemove: (key: string) => {
    if (available) nativeStore.delete(key)
  },
}))

/**
 * localStorage 흉내.
 *
 * `listStateKeys` 가 `Object.keys(localStorage)` 를 쓰기 때문에 **데이터 키가 열거
 * 가능한 자기 속성이어야** 해요. 그래서 메서드는 열거되지 않게 정의합니다.
 */
function makeLocalStorage(): Storage {
  const store: Record<string, string> = {}
  const define = (name: string, fn: unknown) =>
    Object.defineProperty(store, name, { value: fn, enumerable: false })

  define('getItem', (key: string) => (key in store ? store[key] : null))
  define('setItem', (key: string, value: string) => {
    store[key] = String(value)
  })
  define('removeItem', (key: string) => {
    delete store[key]
  })
  return store as unknown as Storage
}

const { clearState, hydrateStorage, loadState, saveState } = await import('@/lib/storage')

beforeEach(() => {
  nativeStore.clear()
  available = true
  globalThis.localStorage = makeLocalStorage()
})

describe('hydrateStorage — 오리진이 바뀌었을 때', () => {
  it('localStorage 가 비어 있으면 네이티브에서 되살려요', async () => {
    // 오리진 변경 직후. 새 오리진의 localStorage 는 완전히 비어 있습니다.
    nativeStore.set('my-way:__keys', JSON.stringify(['card', 'responses']))
    nativeStore.set('my-way:card', JSON.stringify({ name: '흠닐' }))
    nativeStore.set('my-way:responses', JSON.stringify({ answers: [{ key: '1' }] }))

    await hydrateStorage()

    expect(loadState('card', { name: '' })).toEqual({ name: '흠닐' })
    expect(loadState<{ answers: unknown[] }>('responses', { answers: [] }).answers).toHaveLength(1)
  })

  it('localStorage 에 값이 있으면 네이티브가 덮어쓰지 않아요', async () => {
    // 네이티브 쓰기가 실패했던 세션이 있으면 네이티브 쪽이 오래된 값일 수 있어요.
    // 이 오리진이 마지막으로 쓴 localStorage 를 믿습니다.
    saveState('card', { name: '최신' })
    nativeStore.set('my-way:__keys', JSON.stringify(['card']))
    nativeStore.set('my-way:card', JSON.stringify({ name: '오래된값' }))

    await hydrateStorage()

    expect(loadState('card', { name: '' })).toEqual({ name: '최신' })
  })

  it('localStorage 에만 있던 값을 네이티브로 백업해요', async () => {
    // 다음 오리진 변경을 대비하는 쪽. 이게 돌아야 위 첫 번째 시나리오가 성립해요.
    saveState('card', { name: '백업대상' })
    nativeStore.clear()

    await hydrateStorage()

    expect(nativeStore.get('my-way:card')).toBe(JSON.stringify({ name: '백업대상' }))
    expect(JSON.parse(nativeStore.get('my-way:__keys')!)).toContain('card')
  })

  it('인덱스가 깨져 있어도 죽지 않아요', async () => {
    saveState('card', { name: '살아있어야' })
    nativeStore.set('my-way:__keys', '{{깨진 JSON')

    await expect(hydrateStorage()).resolves.toBeUndefined()
    expect(loadState('card', { name: '' })).toEqual({ name: '살아있어야' })
  })
})

describe('네이티브를 못 쓰는 환경', () => {
  it('브라우저에서는 localStorage 만으로 예전처럼 동작해요', async () => {
    available = false

    saveState('card', { name: '브라우저' })
    await hydrateStorage()

    expect(loadState('card', { name: '' })).toEqual({ name: '브라우저' })
    expect(nativeStore.size).toBe(0)
  })
})

describe('쓰기가 양쪽에 반영되는지', () => {
  it('저장하면 네이티브에도 올라가고 인덱스가 갱신돼요', () => {
    saveState('responses', { answers: [] })

    expect(nativeStore.get('my-way:responses')).toBe(JSON.stringify({ answers: [] }))
    expect(JSON.parse(nativeStore.get('my-way:__keys')!)).toEqual(['responses'])
  })

  it('지우면 네이티브에서도 빠져요', () => {
    // 여기가 새면 "내 데이터 삭제" 를 눌러도 네이티브에 남습니다. (db-plan.md)
    saveState('card', { name: '지울것' })
    clearState('card')

    expect(nativeStore.has('my-way:card')).toBe(false)
    expect(JSON.parse(nativeStore.get('my-way:__keys')!)).toEqual([])
  })
})
