import raw from '@content/career_content_v1.json'

/**
 * 문항 원본 로더.
 *
 * `data/career_content_v1.json` 이 단일 소스예요. 여기서만 읽고, 문항 텍스트를
 * 다른 곳에 복사하지 마세요. (CLAUDE.md §2.6, §9)
 *
 * ## 왜 narrative 트랙인가
 *
 * 앱인토스 미니앱은 **만 19세 이상**이 대상입니다. 원본에는 중·고등학생용
 * `teen` 트랙(반말)도 있지만, 도달하지 않는 대상이라 쓰지 않아요.
 *
 * ```
 * teen                 반말 · 중·고등학생   "친구들은 어려워하는데 너는…"
 * jobseeker_narrative  해요체 · 대학생·취준생 "일을 통해 얻고 싶은 게 뭐예요?"
 * ```
 *
 * 앱 전체가 해요체로 통일돼 있어서 어투도 이쪽이 맞습니다.
 *
 * ## 파일을 그대로 두는 이유
 *
 * 1. `licensing` 블록이 여기 있습니다 — AI허브 의무, 차단 목록, 공공누리 확인 결과.
 * 2. `CLAUDE.md §2.6` 이 문항 텍스트 수정을 금지합니다.
 */

/** 화면에 필요한 만큼만. 원본 JSON 의 다른 필드는 안 읽어요. */
export interface Question {
  key: string
  prompt: string
  /** 질문 자체가 정서를 건드려서 상담 자원을 함께 안내할 문항. (CLAUDE.md §8) */
  supportFlag: boolean
}

interface RawItem {
  id: string
  prompt: string
}

interface RawContent {
  tracks: {
    jobseeker_narrative: {
      data: { items: RawItem[]; flow: { recommendedOrder: string[] } }
    }
  }
}

const content = raw as unknown as RawContent

/**
 * `CLAUDE.md §8` 이 정서 신호로 지목한 문항 중 **질문 자체가 무거운 것.**
 * 원본 JSON 에 플래그 필드가 없어서 여기 둡니다.
 *
 * §8 은 `N4` 도 함께 적고 있는데(졸업 후 공백), 그건 **답변에서 드러날 수 있다**는
 * 뜻이지 질문이 무겁다는 게 아니에요. `N4` 는 "지금 방향을 잡게 된 계기가 있었나요?"
 * 라 중립적입니다. 여기에 상담 안내를 미리 띄우면 뜬금없어요.
 *
 * **대신 내용을 봅니다.** 화면이 입력마다 `needsSupport` 로 검사하니 공백·어려움이
 * 실제로 드러나면 그때 안내가 뜹니다. 놓치는 쪽보다 낫다는 원칙은 그대로예요.
 */
const SUPPORT_FLAGGED = new Set(['N7', 'N12'])

/** 서술형 문항 수. 짧아야 의미가 있지만 칭호 재료로는 어느 정도 필요해요. */
export const QUESTION_COUNT = 5

/**
 * 흐름 1에서 쓰는 문항.
 *
 * `flow.recommendedOrder` 앞부분을 그대로 씁니다. 순서에 의존 관계가 걸려 있어요
 * (`N11` 은 `N6`·`N7`·`N9` 뒤) — 앞 다섯 개만 쓰면 자동으로 지켜지지만,
 * **임의로 섞지 마세요.**
 */
export const questions: Question[] = (() => {
  const { items, flow } = content.tracks.jobseeker_narrative.data
  const byId = new Map(items.map((item) => [item.id, item]))

  return flow.recommendedOrder
    .map((id) => byId.get(id))
    .filter((item): item is RawItem => item !== undefined)
    .slice(0, QUESTION_COUNT)
    .map((item) => ({
      key: item.id,
      prompt: item.prompt,
      supportFlag: SUPPORT_FLAGGED.has(item.id),
    }))
})()

/** 문항 id → 질문 문구. AI 에 보낼 때 질문을 함께 넘기려고 씁니다. */
export const promptsByKey = new Map(questions.map((q) => [q.key, q.prompt]))

/** 상담 자원 안내가 걸린 문항 id. 칭호 재료에서도 뺍니다. (CLAUDE.md §8) */
export const supportFlagged = new Set(questions.filter((q) => q.supportFlag).map((q) => q.key))
