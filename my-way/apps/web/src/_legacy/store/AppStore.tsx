import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AppStoreContext } from './appStoreContext'
import type { AppStore, PersistedState } from './appStoreContext'
import type { Answer, CollectedInfo, CollectedInfoKey, ReflectionNote, TossProfile } from '../types'

// v1은 점수 기반 결과를 담고 있어서 호환되지 않아요. 키를 올려 무시합니다.
const STORAGE_KEY = 'my-way:state:v2'
const LEGACY_KEYS = ['my-way:state:v1']

const EMPTY_INFO: CollectedInfo = { desiredCareer: '', strengths: '', hobbies: '' }

const INITIAL: PersistedState = {
  answers: [],
  collectedInfo: EMPTY_INFO,
  note: null,
  tossProfile: null,
}

function load(): PersistedState {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)

    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL
    return { ...INITIAL, ...(JSON.parse(raw) as Partial<PersistedState>) }
  } catch {
    return INITIAL
  }
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // 저장 실패는 무시해요. (시크릿 모드 등)
    }
  }, [state])

  const saveAnswer = useCallback((answer: Answer) => {
    setState((prev) => {
      const rest = prev.answers.filter((item) => item.itemId !== answer.itemId)
      return { ...prev, answers: [...rest, answer] }
    })
  }, [])

  const setCollectedInfo = useCallback((key: CollectedInfoKey, value: string) => {
    setState((prev) => ({ ...prev, collectedInfo: { ...prev.collectedInfo, [key]: value } }))
  }, [])

  const setNote = useCallback((note: ReflectionNote) => {
    setState((prev) => ({ ...prev, note }))
  }, [])

  const setTossProfile = useCallback((tossProfile: TossProfile | null) => {
    setState((prev) => ({ ...prev, tossProfile }))
  }, [])

  /** 다시 하기. 응답과 정리 결과만 비우고, 수집 정보와 로그인 정보는 그대로 둬요. */
  const resetAnswers = useCallback(() => {
    setState((prev) => ({ ...prev, answers: [], note: null }))
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 삭제 실패는 무시해요. 어차피 다음 저장에서 덮어써요.
    }
  }, [])

  const value = useMemo<AppStore>(() => {
    const unfilledInfoKeys = (Object.keys(state.collectedInfo) as CollectedInfoKey[]).filter(
      (key) => state.collectedInfo[key].trim() === '',
    )

    return {
      ...state,
      unfilledInfoKeys,
      hasNote: state.note !== null,
      displayName: state.tossProfile?.name ?? '',
      saveAnswer,
      setCollectedInfo,
      setNote,
      setTossProfile,
      resetAnswers,
      reset,
    }
  }, [state, saveAnswer, setCollectedInfo, setNote, setTossProfile, resetAnswers, reset])

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}
