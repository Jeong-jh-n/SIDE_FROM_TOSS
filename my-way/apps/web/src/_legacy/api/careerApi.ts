import type {
  Answer,
  CardData,
  ChatMessage,
  CollectedInfo,
  QuestionItem,
  ReflectionNote,
} from '../types'
import { QUESTION_ITEMS } from '../data/questions'
import { buildReflectionNote } from '../lib/reflection'
import { delay } from './client'

/**
 * 백엔드 API 레이어 (골격).
 *
 * LLM과 커리어넷 연동은 아직 하지 않아요. 각 함수마다 실제 호출부를 주석으로 남겨두었고,
 * 지금은 로컬 목업 값을 반환해요. 서버가 준비되면 주석을 풀고 목업 return을 지우면 돼요.
 *
 * 커리어넷 Open API는 키 노출과 CORS 때문에 반드시 백엔드 프록시를 거쳐야 해요. (README §2)
 */

/** 자체 문항을 가져와요. */
export async function fetchQuestionItems(): Promise<QuestionItem[]> {
  // return request<QuestionItem[]>('/api/questions')
  return delay(QUESTION_ITEMS, 200)
}

/**
 * 대화 응답을 정리해요.
 *
 * 점수·등급을 만들지 않아요. 자체 문항은 타당화를 거치지 않았기 때문이에요. (README §1)
 * 서버가 붙으면 LLM이 응답을 요약하되, 마찬가지로 수치를 산출하지 않아요.
 */
export async function buildReflection(
  answers: Answer[],
  items: QuestionItem[],
): Promise<ReflectionNote> {
  // return request<ReflectionNote>('/api/reflection', {
  //   method: 'POST',
  //   body: JSON.stringify({ answers }),
  // })
  return delay(buildReflectionNote(answers, items), 700)
}

/**
 * 대화형 진행. 문항 제시와 정보수집이 모두 이 대화에 붙어요.
 *
 * TODO(LLM): 아래 프롬프트 구조로 LLM을 호출해요.
 *   system: 진로 대화 페르소나 + 진행 규칙 + 단정적 해석 금지 + 점수 언급 금지
 *   context: 토스 로그인 프로필 + collectedInfo(희망 진로/특기/취미)
 *   history: 지금까지의 대화
 * collectedInfo에서 비어 있는 항목은 "명확하지 않음"으로 넘겨서,
 * LLM이 대화 중 자연스럽게 되묻고 채우도록 해요.
 */
export async function sendChatMessage(params: {
  history: ChatMessage[]
  message: string
  collectedInfo: CollectedInfo
}): Promise<string> {
  // return request<{ reply: string }>('/api/chat', {
  //   method: 'POST',
  //   body: JSON.stringify(params),
  // }).then((r) => r.reply)
  const unfilled = (Object.keys(params.collectedInfo) as (keyof CollectedInfo)[]).filter(
    (key) => params.collectedInfo[key].trim() === '',
  )
  const hint =
    unfilled.length > 0
      ? ' 아직 비어 있는 정보가 있어서, 이야기하다 보면 다시 여쭤볼게요.'
      : ''
  return delay(
    `(목업 응답) "${params.message}" 라고 하셨네요. AI 연결 전이라 정해진 문장을 돌려드리고 있어요.${hint}`,
    500,
  )
}

/**
 * 정리 이후의 진로 대화 (메타인지 / 구체화 위주).
 * 진행용 대화와 프롬프트가 달라서 별도 함수로 분리했어요.
 */
export async function sendCoachingMessage(params: {
  history: ChatMessage[]
  message: string
  note: ReflectionNote
}): Promise<string> {
  // return request<{ reply: string }>('/api/coaching', {
  //   method: 'POST',
  //   body: JSON.stringify(params),
  // }).then((r) => r.reply)
  return delay(
    `(목업 응답) ${params.note.answeredCount}개 답변을 참고해 답할 예정이에요. AI 연결 후 실제 대화가 들어와요.`,
    500,
  )
}

/**
 * 수집한 정보로 명함 문구를 만들어요.
 * 이미지 렌더링(PNG)은 클라이언트 canvas가 담당해요. (lib/cardCanvas.ts)
 */
export async function generateCardData(params: {
  name: string
  collectedInfo: CollectedInfo
  themeId: string
}): Promise<CardData> {
  // return request<CardData>('/api/card', {
  //   method: 'POST',
  //   body: JSON.stringify(params),
  // })
  const { collectedInfo } = params
  const tags = [collectedInfo.strengths, collectedInfo.hobbies]
    .flatMap((value) => value.split(/[,/]/))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4)

  return delay({
    name: params.name || '이름 없음',
    title: collectedInfo.desiredCareer || '진로 탐색 중',
    tags,
    // TODO(LLM): 한 줄 소개는 LLM이 생성할 자리예요.
    tagline: '나만의 길을 찾는 중',
    themeId: params.themeId,
  })
}
