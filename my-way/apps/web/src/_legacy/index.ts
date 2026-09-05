/**
 * 자체 문항이 다루는 주제.
 *
 * 심리 구성개념이 아니라 "사용자가 어떤 이야기를 했는가"를 가리키는 분류예요.
 * 타당화를 거치지 않은 문항이라 이 값으로 점수·등급을 만들지 않아요. (README §1)
 */
export type Topic = 'worry' | 'confidence' | 'interest' | 'support'

export const TOPIC_LABEL: Record<Topic, string> = {
  worry: '걱정되는 점',
  confidence: '자신 있는 점',
  interest: '관심 · 하고 싶은 것',
  support: '기댈 수 있는 곳',
}

/** 토스 로그인으로 자동 수집되는 정보 (사용자가 직접 입력하지 않음) */
export interface TossProfile {
  name?: string
  phone?: string
  birthday?: string
  gender?: string
  nationality?: string
  email?: string
}

/** 사용자가 대화 중 직접 입력하는 정보 */
export interface CollectedInfo {
  desiredCareer: string
  strengths: string
  hobbies: string
}

export type CollectedInfoKey = keyof CollectedInfo

/** 비워두면 "명확하지 않음"으로 해석하고 나중에 LLM과 함께 채운다 */
export const COLLECTED_INFO_META: Record<
  CollectedInfoKey,
  { label: string; question: string; placeholder: string }
> = {
  desiredCareer: {
    label: '희망 진로',
    question: '어떤 일을 하며 살고 싶어요? 아직 막연해도 괜찮아요.',
    placeholder: '예: 데이터 분석가',
  },
  strengths: {
    label: '특기',
    question: '남들보다 조금 더 잘한다고 느끼는 게 있나요?',
    placeholder: '예: 자료 정리, 발표',
  },
  hobbies: {
    label: '취미',
    question: '시간 가는 줄 모르고 하는 일은 뭐예요?',
    placeholder: '예: 사진 찍기, 러닝',
  },
}

/** 대화에서 던지는 자체 문항 */
export interface QuestionItem {
  id: string
  topic: Topic
  /** AI가 대화에서 그대로 묻는 질문 */
  question: string
}

export interface Answer {
  itemId: string
  text: string
}

export type ChatRole = 'ai' | 'user'
export type ChatKind = 'question' | 'collect' | 'free' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  kind: ChatKind
  text: string
}

/**
 * 대화를 마친 뒤 사용자에게 돌려주는 정리.
 *
 * 점수·등급·수치가 없어요. 남과 비교하려면 규준이 필요한데 자체 문항에는 없기 때문이에요.
 * 대신 **본인 응답 안에서의 상대 비교**만 담아요. (README §5)
 */
export interface ReflectionNote {
  /** 본인 응답에서 상대적으로 많이 이야기한 주제 (최대 2개) */
  emphases: Topic[]
  /** 상대적으로 적게 이야기한 주제 (최대 2개) */
  lighter: Topic[]
  /** 전체 주제를 많이 이야기한 순으로 나열. 수치는 노출하지 않아요 */
  ordering: Topic[]
  /** 응답에서 자주 나온 표현 */
  keywords: string[]
  /** 화면에 보여줄 정리 문장 */
  summary: string
  answeredCount: number
  totalCount: number
}

/** 가상 명함 */
export interface CardData {
  name: string
  title: string
  tags: string[]
  tagline: string
  themeId: string
}
