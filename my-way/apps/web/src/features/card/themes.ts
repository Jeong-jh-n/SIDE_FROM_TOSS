/**
 * 명함 테마.
 *
 * `id` 는 `localStorage` 에 저장되니 **기존 값을 바꾸거나 지우지 마세요.**
 * 저장된 테마를 못 찾으면 첫 번째로 떨어집니다(`themeOf`).
 *
 * `fg` 는 그 배경 위에서 읽히는 글자색이에요. 밝은 배경에는 어두운 글자를 씁니다.
 */
export const CARD_THEMES = [
  // 기존 다섯 개 — 저장된 id 라서 유지
  { id: 'toss', label: '토스 블루', from: '#3182F6', to: '#1B64DA', fg: '#FFFFFF' },
  { id: 'night', label: '미드나잇', from: '#191F28', to: '#333D4B', fg: '#FFFFFF' },
  { id: 'mint', label: '민트', from: '#00B26B', to: '#00875A', fg: '#FFFFFF' },
  { id: 'sunset', label: '선셋', from: '#FF8A5B', to: '#F04452', fg: '#FFFFFF' },
  { id: 'paper', label: '페이퍼', from: '#F9FAFB', to: '#E5E8EB', fg: '#191F28' },

  // 추가
  { id: 'lavender', label: '라벤더', from: '#9775FA', to: '#6741D9', fg: '#FFFFFF' },
  { id: 'ocean', label: '오션', from: '#3BC9DB', to: '#0C8599', fg: '#FFFFFF' },
  { id: 'rose', label: '로즈', from: '#F783AC', to: '#C2255C', fg: '#FFFFFF' },
  { id: 'plum', label: '플럼', from: '#DA77F2', to: '#9C36B5', fg: '#FFFFFF' },
  { id: 'ink', label: '잉크', from: '#4263EB', to: '#1E3A8A', fg: '#FFFFFF' },
  { id: 'forest', label: '포레스트', from: '#51CF66', to: '#2B8A3E', fg: '#FFFFFF' },
  { id: 'clay', label: '클레이', from: '#C99B7A', to: '#8D5B3F', fg: '#FFFFFF' },
  // 밝은 배경 — 글자를 어둡게
  { id: 'amber', label: '앰버', from: '#FFD43B', to: '#F59F00', fg: '#191F28' },
  { id: 'sand', label: '샌드', from: '#FFF4E6', to: '#FFE8CC', fg: '#191F28' },
  { id: 'sky', label: '스카이', from: '#E7F5FF', to: '#A5D8FF', fg: '#191F28' },
] as const

export type CardTheme = (typeof CARD_THEMES)[number]
