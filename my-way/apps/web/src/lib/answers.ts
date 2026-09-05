/**
 * 커리어넷 `report` 용 answers 문자열 조립.
 *
 * **형식이 검사마다 다릅니다.** 2026-08-31 실측으로 확인했어요.
 *
 * | 형식 | 예시 | 쓰는 검사 |
 * |---|---|---|
 * | `pairs` | `"1=5 2=7 3=4"` | 6, 24, 25, 35, 36 |
 * | `values` | `"4,4,5,4"` | **8** |
 *
 * q=8 에 `pairs` 를 보내면 **HTTP 500 "시스템 오류가 발생했습니다"** 가 돌아옵니다.
 * 오래 원인 불명이던 그 오류가 이것이었어요. 커리어넷이 예시 body 를 보내줘서
 * 같은 요청을 형식만 바꿔 시험한 결과입니다.
 *
 * ```
 * answers="1=4 2=4 ..."  → HTTP 500
 * answers="4,4,..."      → 200 SUCC_YN=Y
 * ```
 *
 * `values` 는 값만 순서대로 늘어놓기 때문에 **값 안에 쉼표가 들어가는 특수 문항을
 * 표현할 수 없어요.** (`49=8,1,4` 같은 것) 그래서 특수 문항이 있는 검사는 `pairs`
 * 여야 합니다. 새 검사를 추가할 때 이 점을 확인하세요.
 *
 * **배열 순서 기준으로 1부터** 매깁니다. `qitemNo`는 영역별 시퀀스라 답변 순번과
 * 다를 수 있으므로 답변 번호로 쓰지 마세요. 선택값은 `answerScoreNN` 값을 그대로 씁니다.
 * (CLAUDE.md §5)
 *
 * 특수 문항 규칙은 검사번호별 설정으로 여기 모아둬요. 조건문을 화면에 흩뿌리지 마세요.
 */

/** 한 문항의 응답. 대부분은 단일 선택이고, 일부만 다중·순위·주관식이에요. */
export type AnswerValue =
  | { kind: 'single'; score: number }
  | { kind: 'multi'; scores: number[] }
  | { kind: 'ranked'; scores: number[]; otherText?: string }

export interface SpecialItemRule {
  /** 배열 순서 기준 문항 번호 (1부터) */
  position: number
  kind: 'multi' | 'ranked'
  /** multi: 골라야 하는 개수 / ranked: 매겨야 하는 순위 개수 */
  count: number
  /** 이 선택지를 고르면 주관식 입력을 받아요 */
  otherChoice?: number
  label: string
}

/** 검사번호별 특수 문항. (CLAUDE.md §5) */
export const SPECIAL_ITEMS: Record<number, SpecialItemRule[]> = {
  24: [{ position: 49, kind: 'multi', count: 3, label: '3개를 골라주세요' }],
  25: [{ position: 49, kind: 'multi', count: 3, label: '3개를 골라주세요' }],
  35: [
    { position: 13, kind: 'ranked', count: 2, otherChoice: 8, label: '순위 2개를 골라주세요' },
  ],
  36: [
    { position: 13, kind: 'ranked', count: 2, otherChoice: 9, label: '순위 2개를 골라주세요' },
  ],
}

export function specialRule(q: number, position: number): SpecialItemRule | undefined {
  return SPECIAL_ITEMS[q]?.find((rule) => rule.position === position)
}

/** answers 문자열 형식. 검사마다 달라요. */
export type AnswersFormat = 'pairs' | 'values'

/**
 * 검사번호별 answers 형식. 적혀 있지 않으면 `pairs` 예요.
 *
 * q=6·36 은 `pairs` 로 성공하는 것을 확인했고, q=8 은 `values` 만 받습니다.
 * q=24·25·35 는 특수 문항(값 안에 쉼표)이 있어 `values` 로는 표현 자체가 불가능해요.
 */
const ANSWERS_FORMAT: Record<number, AnswersFormat> = {
  8: 'values',
}

export function answersFormat(q: number): AnswersFormat {
  return ANSWERS_FORMAT[q] ?? 'pairs'
}

/** 주관식 답변에 띄어쓰기가 들어가면 안 돼요. (CLAUDE.md §5) */
export function sanitizeOtherText(text: string): string {
  return text.replace(/\s+/g, '')
}

function formatValue(value: AnswerValue): string {
  if (value.kind === 'single') return String(value.score)

  if (value.kind === 'multi') return value.scores.join(',')

  // ranked: "1,8:방송계열" — 순위 목록 뒤에 주관식이 붙어요.
  const joined = value.scores.join(',')
  const other = value.otherText ? `:${sanitizeOtherText(value.otherText)}` : ''
  return `${joined}${other}`
}

export class AnswersError extends Error {}

/**
 * 응답 배열을 answers 문자열로 조립해요.
 * `values[i]`는 **i번째로 제시된 문항**의 응답이며, 번호는 `i + 1`이 됩니다.
 *
 * 형식은 `answersFormat(q)` 가 정해요. `values` 형식은 번호를 붙이지 않고 값만
 * 순서대로 잇습니다.
 */
export function buildAnswers(q: number, values: (AnswerValue | undefined)[]): string {
  const format = answersFormat(q)
  const parts: string[] = []

  values.forEach((value, index) => {
    const position = index + 1

    if (value === undefined) {
      throw new AnswersError(`${position}번 문항의 응답이 없어요`)
    }

    const rule = specialRule(q, position)

    if (rule && value.kind === 'single') {
      throw new AnswersError(`${position}번은 ${rule.label} (단일 선택 불가)`)
    }

    if (rule && value.kind !== 'single' && value.scores.length !== rule.count) {
      throw new AnswersError(
        `${position}번은 ${rule.count}개가 필요한데 ${value.scores.length}개가 왔어요`,
      )
    }

    if (!rule && value.kind !== 'single') {
      throw new AnswersError(`${position}번은 단일 선택 문항이에요`)
    }

    parts.push(format === 'values' ? formatValue(value) : `${position}=${formatValue(value)}`)
  })

  return format === 'values' ? parts.join(',') : parts.join(' ')
}

/**
 * 부분 응답으로도 조립해요 — 진행 상태 저장·복원 확인용. 빈 문항은 건너뜁니다.
 * 검증 없이 형식만 맞추므로 검사번호를 받지 않아요.
 */
export function buildPartialAnswers(values: (AnswerValue | undefined)[]): string {
  return values
    .map((value, index) => (value ? `${index + 1}=${formatValue(value)}` : null))
    .filter((part): part is string => part !== null)
    .join(' ')
}
