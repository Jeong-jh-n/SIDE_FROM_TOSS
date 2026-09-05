import type { Answer, QuestionItem, ReflectionNote, Topic } from '../types'
import { TOPIC_LABEL } from '../types'

/**
 * 대화 응답을 정리해 돌려주는 로직.
 *
 * 점수·등급을 만들지 않아요. 자체 문항은 타당화를 거치지 않았고,
 * 남과 비교하려면 규준이 필요한데 그게 없기 때문이에요. (README §1, §5)
 *
 * 여기서 하는 계산은 "어느 주제를 상대적으로 더 많이 이야기했는가"뿐이에요.
 * 이건 심리 구성개념이 아니라 응답에서 바로 관찰되는 값이라, 개인 내 비교에만 씁니다.
 * 계산된 수치는 순서를 정하는 데만 쓰고 화면에는 노출하지 않아요.
 */

/** 한 응답에서 얼마나 풀어서 이야기했는지. 내부 정렬용 값이며 노출하지 않아요. */
function elaboration(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0

  const words = trimmed.split(/\s+/).filter(Boolean)
  const clauses = trimmed.split(/[,.!?·]|그리고|그래서|그런데/).filter((part) => part.trim() !== '')

  // 글자 수는 상한을 둬서 한 문항이 전체를 좌우하지 않게 해요.
  return Math.min(trimmed.length, 120) + words.length * 3 + clauses.length * 5
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function extractKeywords(answers: Answer[]): string[] {
  const words = answers
    .flatMap((answer) => answer.text.split(/\s+/))
    .map((word) => word.replace(/[^가-힣a-zA-Z]/g, ''))
    .filter((word) => word.length >= 2)

  const counts = new Map<string, number>()
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)
}

/**
 * 정리 문장을 만들어요.
 * "네 안에서는 A가 두드러지고 B는 상대적으로 덜 나왔어" 형태의 개인 내 비교만 씁니다.
 */
function buildSummary(
  emphases: Topic[],
  lighter: Topic[],
  answeredCount: number,
  totalCount: number,
): string {
  if (answeredCount === 0) {
    return '아직 이야기한 내용이 없어요. 대화를 이어가면 여기에 정리해 드릴게요.'
  }

  if (answeredCount < Math.ceil(totalCount / 2)) {
    return '아직 이야기가 많지 않아서 정리하기에는 일러요. 질문에 조금 더 답해보면 흐름이 보일 거예요.'
  }

  if (emphases.length === 0) {
    return '여러 주제를 고르게 이야기했어요. 특별히 한쪽으로 치우치지 않았네요.'
  }

  const front = emphases.map((topic) => TOPIC_LABEL[topic]).join('과 ')
  const head = `이야기를 들어보니 ${front} 쪽에 말이 많았어요.`

  if (lighter.length === 0) return head

  const back = lighter.map((topic) => TOPIC_LABEL[topic]).join('과 ')
  return `${head} 반면 ${back}에 대해서는 상대적으로 말수가 적었어요. 어느 쪽이 좋고 나쁜 건 아니고, 지금 마음이 어디에 가 있는지를 보여주는 정도예요.`
}

export function buildReflectionNote(
  answers: Answer[],
  items: QuestionItem[],
): ReflectionNote {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const byTopic = new Map<Topic, number[]>()

  for (const answer of answers) {
    const item = itemById.get(answer.itemId)
    if (!item) continue
    const bucket = byTopic.get(item.topic) ?? []
    bucket.push(elaboration(answer.text))
    byTopic.set(item.topic, bucket)
  }

  // 많이 이야기한 순으로 정렬. 이 수치는 여기서만 쓰고 밖으로 내보내지 않아요.
  const ranked = [...byTopic.entries()]
    .map(([topic, values]) => ({ topic, weight: average(values) }))
    .sort((a, b) => b.weight - a.weight)

  const answeredCount = answers.filter((answer) => answer.text.trim() !== '').length
  const spoken = ranked.filter((entry) => entry.weight > 0)

  // 주제 간 차이가 거의 없으면 "두드러진다"고 말하지 않아요.
  const top = spoken[0]?.weight ?? 0
  const bottom = spoken[spoken.length - 1]?.weight ?? 0
  const hasContrast = spoken.length >= 2 && top > bottom * 1.4

  const emphases = hasContrast ? spoken.slice(0, 2).map((entry) => entry.topic) : []
  const lighter = hasContrast ? spoken.slice(-2).map((entry) => entry.topic).reverse() : []

  // 앞뒤가 겹치면 대비가 의미 없으므로 비웁니다.
  const overlapping = emphases.some((topic) => lighter.includes(topic))

  return {
    emphases: overlapping ? [] : emphases,
    lighter: overlapping ? [] : lighter,
    ordering: ranked.map((entry) => entry.topic),
    keywords: extractKeywords(answers),
    summary: buildSummary(
      overlapping ? [] : emphases,
      overlapping ? [] : lighter,
      answeredCount,
      items.length,
    ),
    answeredCount,
    totalCount: items.length,
  }
}
