/**
 * 진행 상태 저장.
 *
 * 서버 세션이 없어요. 문항 하나 답할 때마다 저장하고, 재진입 시 이어서 진행해요.
 * (CLAUDE.md §3, §5)
 *
 * 자유 서술이 들어가므로 **콘솔·에러 리포팅으로 내보내지 마세요.** (CLAUDE.md §2.8)
 */

const PREFIX = 'my-way:'

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
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // 저장 실패는 무시해요. (시크릿 모드 등)
  }
}

export function clearState(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(PREFIX + key)
  } catch {
    // 무시
  }
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

  if (key.startsWith('track:')) {
    // 문답은 answers, 체크리스트는 checked 에 쌓여요. 건너뛴 것도 사용자 행동이라 셉니다.
    const answers = Array.isArray(v.answers) ? v.answers.length : 0
    const checked = Array.isArray(v.checked) ? v.checked.length : 0
    return answers > 0 || checked > 0
  }

  if (key.startsWith('inspect:result:')) {
    return Boolean(v.reportUrl) || Boolean(v.lowestArea)
  }

  if (key.startsWith('inspect:')) {
    const answered = Array.isArray(v.values) && v.values.some((x) => x !== null && x !== undefined)
    return answered || v.startDtm != null || Boolean(v.reportUrl)
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

/** 트랙별 저장 키. 재시작할 때 함께 지워야 하는 것들을 한곳에 모아둬요. */
export const TRACK_KEYS: Record<string, string[]> = {
  teen: ['track:teen'],
  jobseeker_behavior: ['track:jobseeker_behavior'],
  jobseeker_narrative: ['track:jobseeker_narrative'],
}

/** 검사 진행 상태와 결과(결과표 URL·선택 영역)를 함께 지워요. */
export function inspectKeys(q: number): string[] {
  return [`inspect:${q}`, `inspect:result:${q}`]
}
