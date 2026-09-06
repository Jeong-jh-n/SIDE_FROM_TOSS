/**
 * 진행 상태 저장.
 *
 * 서버 세션이 없어요. 문항 하나 답할 때마다 저장하고, 재진입 시 이어서 진행해요.
 * (CLAUDE.md §3, §5)
 *
 * 자유 서술이 들어가므로 **콘솔·에러 리포팅으로 내보내지 마세요.** (CLAUDE.md §2.8)
 *
 * ## localStorage 를 그대로 두되, 네이티브에 사본을 둡니다
 *
 * `localStorage` 는 **오리진에 묶입니다.** 앱인토스 SDK 를 3.1.1 이상으로 올리면
 * 웹뷰 오리진이 바뀌고, 이전 오리진의 값은 읽을 방법이 사라져요. 브라우저 규칙이라
 * 우회가 안 됩니다.
 *
 * 그래서 저장할 때마다 **토스 네이티브 저장소에도 같은 값을 씁니다.** 네이티브는
 * 오리진과 무관해요. 앱이 뜰 때 `hydrateStorage()` 가 둘을 맞춰 놓기 때문에,
 * 읽는 쪽(`loadState` 등)은 예전 그대로 localStorage 만 봅니다.
 *
 * ```
 * 앱 시작   hydrateStorage()   네이티브 ↔ localStorage 동기화
 * 읽기      loadState          localStorage (동기, 안 바뀜)
 * 쓰기      saveState          localStorage + 네이티브(비동기)
 * ```
 *
 * 네이티브를 못 쓰는 환경(브라우저 개발 등)에서는 조용히 localStorage 만 씁니다.
 */

import { nativeAvailable, nativeGet, nativeRemove, nativeSet } from '@/lib/nativeStorage'

const PREFIX = 'my-way:'

/**
 * 네이티브 저장소에는 **키 목록 API 가 없어서** 우리가 인덱스를 들고 있어요.
 * 저장·삭제할 때마다 갱신합니다.
 */
const INDEX_KEY = PREFIX + '__keys'

/** 인덱스를 네이티브에 다시 씁니다. localStorage 쪽 키 목록이 곧 진실이에요. */
function syncIndex(): void {
  if (!nativeAvailable()) return
  nativeSet(INDEX_KEY, JSON.stringify(listStateKeys()))
}

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

export function saveState<T>(key: string, value: T): void {
  const raw = JSON.stringify(value)
  try {
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    // 저장 실패는 무시해요. (시크릿 모드 등)
  }
  // 오리진이 바뀌어도 남도록 네이티브에도 씁니다. 결과는 기다리지 않아요.
  nativeSet(PREFIX + key, raw)
  syncIndex()
}

export function clearState(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(PREFIX + key)
  } catch {
    // 무시
  }
  for (const key of keys) nativeRemove(PREFIX + key)
  syncIndex()
}

/** 저장된 우리 키 목록. 초기화 버튼 노출 여부를 정할 때 써요. */
export function listStateKeys(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .map((key) => key.slice(PREFIX.length))
  } catch {
    return []
  }
}

/**
 * 저장된 값에 **실제 내용이 있는지** 봐요.
 *
 * 키가 있는 것만으로는 부족합니다. 화면은 마운트되자마자 빈 상태를 저장하거든요
 * (`QuestionFlow`, `CardRoute` 의 저장 effect). 그래서 한 글자도 안 쓰고 들어갔다
 * 나와도 키가 생기고, "전체 지우기" 버튼이 지울 것도 없이 떠 있었습니다.
 *
 * 저장 흐름을 건드리면 재진입 이어하기가 위험해져서, **판정 쪽만** 고쳤어요.
 */
export function stateHasContent(key: string, value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>

  if (key === 'responses') {
    // 건너뛴 것도 사용자 행동이라 셉니다.
    return Array.isArray(v.answers) && v.answers.length > 0
  }

  if (key === 'card') {
    // themeId·taglineSource 는 항상 값이 있어서 세지 않아요.
    const info = (v.info ?? {}) as Record<string, unknown>
    const filled = (x: unknown) => typeof x === 'string' && x.trim() !== ''
    return (
      filled(v.name) ||
      filled(v.tagline) ||
      filled(v.aiTagline) ||
      Object.values(info).some(filled)
    )
  }

  // 모르는 키는 내용이 있다고 봅니다. 지울 수 있는 걸 숨기는 것보다 낫습니다.
  return true
}

export function hasAnyState(): boolean {
  try {
    return listStateKeys().some((key) => {
      const raw = localStorage.getItem(PREFIX + key)
      if (!raw) return false
      try {
        return stateHasContent(key, JSON.parse(raw))
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/** 전체 초기화. 이 앱이 저장한 값만 지워요. */
export function clearAllState(): void {
  clearState(...listStateKeys())
}

/**
 * 앱이 뜰 때 한 번 — 네이티브 저장소와 localStorage 를 맞춥니다.
 *
 * **화면을 그리기 전에 끝나야 해요.** 먼저 그리면 빈 상태가 보였다가 값이 튀어나오고,
 * 그 사이에 저장 effect 가 돌면 **빈 값으로 덮어씁니다.**
 *
 * ## 어느 쪽을 믿는가
 *
 * | localStorage | 처리 |
 * |---|---|
 * | 값이 있음 | **그쪽을 씁니다.** 이 오리진이 마지막으로 쓴 값이에요. 네이티브로 밀어 올려 백업 |
 * | 값이 없음 | 네이티브에서 되살립니다. **오리진이 바뀐 경우가 여기예요** |
 *
 * 타임스탬프가 없어서 "더 새것"을 가릴 수 없는데, 이 규칙이면 두 상황 모두 맞아요.
 * 네이티브 쓰기가 실패했던 세션이 있어도 localStorage 쪽이 살아남습니다.
 *
 * 네이티브를 못 쓰면 아무것도 하지 않고 끝납니다. 실패해도 앱은 그대로 돌아가요.
 */
export async function hydrateStorage(): Promise<void> {
  // 첫 호출로 네이티브를 쓸 수 있는 환경인지 판정돼요.
  const rawIndex = await nativeGet(INDEX_KEY)
  if (!nativeAvailable()) return

  let nativeKeys: string[] = []
  if (rawIndex) {
    try {
      const parsed: unknown = JSON.parse(rawIndex)
      if (Array.isArray(parsed)) nativeKeys = parsed.filter((k): k is string => typeof k === 'string')
    } catch {
      // 인덱스가 깨졌으면 없는 셈 치고 localStorage 쪽으로 다시 세웁니다.
    }
  }

  // 1) localStorage 에 없는 것만 네이티브에서 되살려요. (오리진 변경 복구)
  for (const key of nativeKeys) {
    let existing: string | null = null
    try {
      existing = localStorage.getItem(PREFIX + key)
    } catch {
      // 무시
    }
    if (existing !== null) continue

    const value = await nativeGet(PREFIX + key)
    if (value === null) continue
    try {
      localStorage.setItem(PREFIX + key, value)
    } catch {
      // 무시
    }
  }

  // 2) localStorage 에 있는 것을 네이티브로 밀어 올려요. (다음 오리진 변경 대비)
  for (const key of listStateKeys()) {
    try {
      const value = localStorage.getItem(PREFIX + key)
      if (value !== null) nativeSet(PREFIX + key, value)
    } catch {
      // 무시
    }
  }

  syncIndex()
}
