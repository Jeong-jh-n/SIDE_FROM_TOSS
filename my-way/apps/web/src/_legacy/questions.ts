import type { QuestionItem } from '../types'

/**
 * 자체 대화 문항.
 *
 * NOTE: 아래 문항은 화면/로직 검증용 샘플이에요.
 *       실제 서비스에서는 `career_content_v1.json`의 3개 트랙 문항으로 교체해야 해요.
 *       교체 전까지는 트랙 구분 없이 단일 목록으로 동작해요. (README §0)
 *
 * 타당화를 거치지 않은 문항이라 이 응답으로 점수·등급을 산출하지 않아요. (README §1)
 */
export const QUESTION_ITEMS: QuestionItem[] = [
  { id: 'q01', topic: 'interest', question: '요즘 가장 궁금하거나 관심이 가는 일이 뭐예요?' },
  { id: 'q02', topic: 'worry', question: '진로를 생각하면 마음이 어떤가요?' },
  { id: 'q03', topic: 'confidence', question: '내가 잘 해낼 수 있다고 믿는 일은 어떤 거예요?' },
  { id: 'q04', topic: 'worry', question: '당신의 10년 뒤 미래는 어떨 것 같나요?' },
  { id: 'q05', topic: 'support', question: '진로 이야기를 편하게 나눌 수 있는 사람이 있나요?' },
  { id: 'q06', topic: 'interest', question: '한 번쯤 경험해보고 싶은 직업이 있다면 뭐예요?' },
  { id: 'q07', topic: 'confidence', question: '주변 사람들이 당신에게 자주 부탁하는 일은 뭔가요?' },
  { id: 'q08', topic: 'worry', question: '진로를 정하기 어렵게 만드는 건 뭐라고 생각해요?' },
  { id: 'q09', topic: 'support', question: '힘들 때는 주로 어디에 기대나요?' },
  { id: 'q10', topic: 'interest', question: '요즘 새로 배워보고 싶은 게 있나요?' },
  { id: 'q11', topic: 'confidence', question: '끝까지 해냈다고 느낀 경험을 하나 들려주실래요?' },
  { id: 'q12', topic: 'worry', question: '가장 피하고 싶은 미래는 어떤 모습인가요?' },
]

/**
 * 어려움을 시사하는 응답이 나올 수 있는 문항. (README §6 정서적 신호 대응)
 * 이 문항의 응답에는 단정적 해석을 붙이지 않고, 상담 자원 안내를 함께 노출해요.
 */
export const SENSITIVE_ITEM_IDS = new Set(['q05', 'q08', 'q09', 'q12'])

/** 명함 테마 */
export const CARD_THEMES = [
  { id: 'toss', label: '토스 블루', from: '#3182F6', to: '#1B64DA', fg: '#FFFFFF' },
  { id: 'night', label: '미드나잇', from: '#191F28', to: '#333D4B', fg: '#FFFFFF' },
  { id: 'mint', label: '민트', from: '#00B26B', to: '#00875A', fg: '#FFFFFF' },
  { id: 'sunset', label: '선셋', from: '#FF8A5B', to: '#F04452', fg: '#FFFFFF' },
  { id: 'paper', label: '페이퍼', from: '#F9FAFB', to: '#E5E8EB', fg: '#191F28' },
] as const

export type CardTheme = (typeof CARD_THEMES)[number]
