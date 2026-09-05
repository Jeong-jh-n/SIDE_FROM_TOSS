import { createContext, useContext } from 'react'
import type { Answer, CollectedInfo, CollectedInfoKey, ReflectionNote, TossProfile } from '../types'

export interface PersistedState {
  answers: Answer[]
  collectedInfo: CollectedInfo
  note: ReflectionNote | null
  tossProfile: TossProfile | null
}

export interface AppStore extends PersistedState {
  /** 비어 있는 정보수집 항목 = "명확하지 않음" */
  unfilledInfoKeys: CollectedInfoKey[]
  hasNote: boolean
  displayName: string
  saveAnswer: (answer: Answer) => void
  setCollectedInfo: (key: CollectedInfoKey, value: string) => void
  setNote: (note: ReflectionNote) => void
  setTossProfile: (profile: TossProfile | null) => void
  /** 다시 하기: 대화 응답과 정리 결과만 지우고 수집 정보·로그인 정보는 남겨요. */
  resetAnswers: () => void
  /** 전체 초기화: 저장된 값을 모두 지워요. */
  reset: () => void
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext)
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>')
  return store
}
