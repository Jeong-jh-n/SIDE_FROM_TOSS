/** 가상 명함에 들어가는 값. */
export interface CardData {
  name: string
  title: string
  tags: string[]
  tagline: string
  /**
   * 칭호가 AI가 만든 것인지.
   *
   * `true` 면 명함에 **마크를 앞에 붙여** 그려요. 직접 쓴 칭호와 구분하려는 거예요 —
   * 어느 쪽이 기계가 쓴 글인지 보는 사람이 알 수 있어야 합니다. (CLAUDE.md §7)
   */
  taglineFromAi: boolean
  themeId: string
}

/**
 * 사용자가 직접 입력하는 항목. 비워두면 "아직 명확하지 않음"으로 봐요.
 *
 * 명함 시안(`카드.png`)의 태그 자리가 두 개라, **특기 한 줄 · 취미 한 줄**로 받아
 * 그대로 태그 두 개가 되게 했어요. 쉼표로 여러 개를 받으면 자리와 안 맞습니다.
 */
export interface CardInfo {
  desiredCareer: string
  strengths: string
  hobby: string
}

export type CardInfoKey = keyof CardInfo

export const CARD_INFO_META: Record<CardInfoKey, { label: string; placeholder: string }> = {
  desiredCareer: { label: '희망 진로', placeholder: '예: 데이터 분석가' },
  strengths: { label: '특기', placeholder: '예: 자료 정리' },
  hobby: { label: '취미', placeholder: '예: 사진 찍기' },
}

/** 토스 로그인으로 받아오는 정보. 서버 교환이 필요해 지금은 비어 있어요. */
export interface TossProfile {
  name?: string
  phone?: string
  birthday?: string
  gender?: string
  nationality?: string
  email?: string
}
