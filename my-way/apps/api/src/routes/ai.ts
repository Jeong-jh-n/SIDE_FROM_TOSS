import type { FastifyInstance } from 'fastify'
import { aiHealth, complete, AiUnavailableError } from '../lib/ai.js'
import { containsDistressSignal, containsRiskSignal } from '../lib/safety.js'
import { CHARACTERS, characterById, TALK_MAX_TURNS, TALK_MIN_TURNS } from '../lib/characters.js'

const NEWLINE = '\n'

/**
 * AI 보조 라우트.
 *
 * ## 이 라우트가 하는 일 / 하지 않는 일
 *
 * **하는 일** — 트랙 A(중·고등학생)에서 응답이 얇을 때, 다음 이야기를 끌어낼
 * 보조 질문 하나를 만들어 줍니다.
 *
 * **하지 않는 일** — 점수·등급·판정을 만들지 않습니다. (CLAUDE.md §2.3, §7)
 * 모델은 판정 문구를 뱉을 수 있으므로 §7 금지어를 여기서 한 번 거릅니다.
 *
 * ## AI 없이도 앱은 돌아가야 해요
 *
 * 추론 서버는 별도 프로세스라 안 떠 있을 수 있습니다. 그때 500을 던지면 문답이
 * 멈춰버려요. **`available: false` 로 200을 돌려주고 프론트가 JSON에 있는 기존
 * 보조질문으로 넘어가게** 합니다.
 */

/**
 * 트랙별 프로필 — 어투와 모델을 함께 고릅니다.
 *
 * 판정하지 말라는 §7 규칙을 프롬프트에도 넣어 둡니다. 그래도 새어나올 수 있어서
 * 아래 `violatesExpressionRules()` 로 한 번 더 거릅니다.
 *
 * ## 왜 지금은 두 트랙 다 어댑터를 끄나
 *
 * 진로 LoRA는 `제시어 → 학생 답변`으로 학습돼서 **상담사가 아니라 학생을 흉내냅니다.**
 * 되물을 질문을 만들어야 하는 이 자리에는 맞지 않아요. 실측 히트율입니다.
 *
 * | 트랙 | 어댑터 켬 | 어댑터 끔(베이스) |
 * |---|---|---|
 * | teen | 1/10 | 5/5 |
 * | jobseeker | 1/10 | 10/10 |
 *
 * 어투도 베이스 쪽이 맞습니다. 프롬프트로 반말/해요체를 지시하면 그대로 따라와요.
 * 어댑터를 켜면 지시와 무관하게 고등학생 반말로 새어나옵니다.
 *
 * **`useAdapter`는 남겨 둡니다.** 학습 타깃을 `(제시어+답변) → 상담사 코멘트`로 바꿔
 * 다시 학습하면 그때 트랙별로 켜면 돼요.
 */
const PROFILES = {
  teen: {
    system: [
      '너는 중·고등학생의 진로 이야기를 들어주는 사람이야.',
      '평가하거나 점수를 매기지 말고, 아이가 더 말하고 싶어지도록 짧게 되물어.',
      '반말로, 한 문장짜리 질문 하나만 해.',
    ].join(' '),
    useAdapter: false,
  },
  jobseeker: {
    system: [
      '너는 취업을 준비하는 사람의 이야기를 들어주는 상담자예요.',
      '평가하거나 점수를 매기지 말고, 자기 경험을 더 구체적으로 떠올리도록 짧게 되물어 주세요.',
      '해요체로, 한 문장짜리 질문 하나만 하세요.',
    ].join(' '),
    useAdapter: false,
  },
} as const

export type AiTrack = keyof typeof PROFILES

function profileFor(track: unknown): (typeof PROFILES)[AiTrack] {
  return track === 'jobseeker' ? PROFILES.jobseeker : PROFILES.teen
}

/** CLAUDE.md §7 이 자체 문항 결과에 금지한 표현들. */
const FORBIDDEN = [
  '검사',
  '진단',
  '측정',
  '점수',
  '등급',
  '상위',
  '높은 편',
  '낮은 편',
  '보통 수준',
  '유형은',
]

/**
 * 능력을 단정하는 말.
 *
 * §7 의 금지 목록에 직접 적혀 있진 않지만 **"경계선은 단정하느냐에 있습니다"** 라는
 * 기준에 걸려요. 실제로 "창의력과 표현 능력이 뛰어나" 같은 출력이 관측됐습니다.
 * 칭찬이어도 능력 수준을 못박는 건 자체 문항이 할 일이 아니에요. (§1 측정은 커리어넷)
 *
 * 허용되는 건 **한 말과 한 일**을 짚는 쪽입니다.
 * 예: "그림 얘기가 여러 번 나왔어" (⭕) vs "표현 능력이 뛰어나" (❌)
 */
const ABILITY_CLAIMS = [
  // 어간만 넣으면 관형형을 놓칩니다. '뛰어난'.includes('뛰어나') 는 false 예요.
  // (뛰어"난" 과 뛰어"나" 는 다른 글자) 그래서 활용형까지 함께 둡니다.
  '뛰어나',
  '뛰어난',
  '탁월',
  '우수',
  '부족',
  '훌륭',
  '남다',
]

export function violatesExpressionRules(text: string): boolean {
  return FORBIDDEN.some((word) => text.includes(word))
}

/**
 * 모델 출력을 질문 한 문장으로 다듬어요.
 *
 * 학습 데이터가 문장완성형이라 모델이 질문 대신 서술을 뱉는 일이 잦습니다.
 * 물음표로 끝나는 첫 문장만 취하고, 없으면 실패로 봅니다.
 *
 * **너무 짧은 것도 버려요.** "유튜버?" 같은 한 단어 되물음이 실제로 관측됐는데,
 * 형식은 질문이지만 이야기를 끌어내지 못하고 오히려 답을 좁힙니다.
 */
const MIN_QUESTION_CHARS = 8
const MAX_QUESTION_CHARS = 80

export function extractQuestion(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const match = text.match(
    new RegExp(`^[^?？\\n]{${MIN_QUESTION_CHARS},${MAX_QUESTION_CHARS}}[?？]`),
  )
  if (!match) return null

  const question = match[0].trim()
  if (violatesExpressionRules(question)) return null

  return question
}

/**
 * 결과 피드백 프로필.
 *
 * ## §7 을 넘지 않으려면
 *
 * "경계선은 단정하느냐에 있습니다"(§7). 등급·점수로 규정하지 않고 **관찰한 것을 짚고
 * 제안하는 선**까지만 갑니다. §7 이 든 예시가 기준이에요.
 *
 * ```
 * ❌ "너는 진로성숙도가 낮은 편이야"
 * ⭕ "진로를 구체적으로 그려본 경험은 아직 많지 않은 것 같아. 이런 걸 해보면 어떨까?"
 * ```
 *
 * 프롬프트로 막고, 그래도 새어나오면 `sanitizeFeedback()` 이 통째로 버립니다.
 */
const FEEDBACK_PROFILES = {
  teen: {
    system: [
      '너는 중·고등학생의 진로 이야기를 들어주는 사람이야.',
      '아이가 한 말이나 한 일 중에 눈에 띄는 것을 짚고, 다음에 해볼 만한 것을 하나 제안해.',
      '능력을 평가하지 마. "뛰어나다/부족하다"처럼 잘하고 못하고를 말하지 마.',
      '"당신"이라고 부르지 말고 "너"라고 해.',
      '점수·등급·수준을 매기지 마. "높다/낮다/부족하다"처럼 단정하지 마.',
      '반말로, 두 문장으로만 짧게 말해.',
    ].join(' '),
    useAdapter: false,
  },
  jobseeker: {
    system: [
      '너는 취업을 준비하는 사람의 이야기를 들어주는 상담자예요.',
      '한 말에서 눈에 띄는 것을 짚고, 더 돌아보면 좋을 지점을 하나 제안하세요.',
      '능력을 평가하지 마세요. "뛰어나다/부족하다"처럼 잘하고 못하고를 말하지 마세요.',
      '자기소개서 문장을 예시로라도 써주지 마세요. 따옴표로 문장을 만들어 주지 마세요.',
      '점수·등급·수준을 매기지 말고 단정하지 마세요.',
      '해요체로, 두 문장으로만 짧게 말하세요.',
    ].join(' '),
    useAdapter: false,
  },
} as const

/**
 * 피드백 길이 상한.
 *
 * 길어지면 판정처럼 읽히고 화면도 무거워져요. 다만 이 값에 걸리면 **피드백이 통째로
 * 사라집니다.** 프롬프트로 짧게 시키고, 상한은 그보다 넉넉히 둡니다.
 */
const MAX_FEEDBACK_CHARS = 600

/**
 * 모델이 붙이는 마크다운을 걷어내요.
 *
 * `**강조**` 나 머리말 `#` 이 실제로 섞여 나옵니다. 화면에는 별표가 그대로 찍혀요.
 * 줄바꿈은 문단 하나로 눌러 둡니다.
 */
function stripMarkup(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    // \s 가 개행도 포함하므로 공백·줄바꿈을 한 번에 눌러요.
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 자기소개서를 대신 써준 흔적을 잡아내요.
 *
 * §7 이 **"자기소개서를 대신 작성하지 마세요"** 라고 못박고 있는데, 실제로 모델이
 * 따옴표 안에 완성된 자소서 문장을 넣어 주는 게 관측됐습니다.
 *
 * ```
 * 예를 들어, "프로토타입 제작 중 기술적 난관에 부딪혔을 때 ... 구현할 수 있었습니다"
 * ```
 *
 * 긴 인용문이 들어 있으면 대신 써준 것으로 보고 버립니다.
 */
const GHOSTWRITE_QUOTE = /["“”'']([^"“”'']{30,})["“”'']/

export function looksLikeGhostwriting(text: string): boolean {
  return GHOSTWRITE_QUOTE.test(text)
}

/**
 * 마지막 완결 문장까지만 남겨요.
 *
 * `max_new_tokens` 에 걸리면 생성이 **문장 중간에서 끊깁니다.** 화면에 그대로 쓰면
 * 말이 잘린 채로 보여요. 끝맺지 못한 꼬리를 떼고 완결된 데까지만 씁니다.
 * 뗀 뒤에 남는 게 너무 짧으면 아예 버려요.
 */
function trimToCompleteSentence(text: string): string {
  if (/[.!?…]$/.test(text)) return text

  const lastStop = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'))

  // 종결부호가 하나도 없으면 통째로 잘린 조각으로 봐요. 관측된 출력은 모두
  // 마침표로 끝났으므로, 부호가 없다는 건 도중에 끊겼다는 신호입니다.
  if (lastStop === -1) return ''

  return text.slice(0, lastStop + 1)
}

/**
 * 피드백을 화면에 쓸 수 있는지 판정해요.
 *
 * §7 금지 표현이 하나라도 있으면 **일부를 고치지 않고 통째로 버립니다.**
 * 부분 수정은 뜻이 바뀌어 더 위험해요. 버리면 피드백 없이 기존 정리 화면만 남습니다.
 * (마크다운 기호만은 뜻을 바꾸지 않으므로 걷어냅니다.)
 */
export function sanitizeFeedback(raw: string, track: AiTrack = 'teen'): string | null {
  const text = trimToCompleteSentence(stripMarkup(raw))
  // 꼬리를 뗀 뒤 남는 게 없으면 버려요.
  if (text.length < 10) return null
  if (text.length > MAX_FEEDBACK_CHARS) return null
  if (violatesExpressionRules(text)) return null
  if (ABILITY_CLAIMS.some((word) => text.includes(word))) return null
  if (looksLikeGhostwriting(text)) return null
  // 트랙 A는 반말이에요. "당신"이 섞이면 말투가 튑니다.
  if (track === 'teen' && text.includes('당신')) return null
  return text
}

/**
 * 명함 칭호(tagline) 프로필.
 *
 * ## §7 을 넘지 않는 선
 *
 * §7 이 **"당신의 유형은 X입니다"** 를 금지합니다. 칭호는 본질적으로 유형 라벨이라
 * 잘못 만들면 바로 걸려요. 그래서 두 가지를 지킵니다.
 *
 * 1. **재료는 자체 문답 응답만.** 커리어넷 검사 결과를 섞지 않아요.
 *    섞으면 "공인 검사가 나를 이렇게 판정했다"로 읽힙니다.
 * 2. **없는 분류를 만들지 않고 사용자가 한 말에서 뽑습니다.**
 *
 * ```
 * ❌ "탐색형 인재"          없는 유형 체계를 지어냄
 * ⭕ "그림으로 말하는 사람"   "그림 그리는 거" 라고 한 말에서 나옴
 * ```
 *
 * 화면에서는 **고칠 수 있고 다시 뽑을 수 있게** 둡니다. 판정은 못 고치지만
 * 제안은 고칠 수 있어요. 그 차이가 경계를 지킵니다.
 */
const TAGLINE_PROFILES = {
  teen: [
    '너는 사람을 한 줄로 소개하는 문구를 만드는 사람이야.',
    '아이가 한 말에 나온 표현을 재료로, 명함에 넣을 짧은 문구를 하나 만들어.',
    '"~형 인재" 처럼 유형으로 분류하지 마. 잘하고 못하고를 말하지 마.',
    '아이가 쓴 말을 그대로 옮기지 마. 같은 뜻을 다른 표현으로 바꿔서 써.',
    '무엇을 묻고 답한 건지 보고 써. 싫다고 답한 걸 좋아하는 것처럼 만들지 마.',
    '"그림 그리는 사람", "귀 기울이는 친구" 처럼 동사를 넣어 써. 명사만 늘어놓지 마.',
    '수식을 겹쳐 붙이지 마. "정신건강 탐구가 취미인 탐구자" 말고 "정신건강 탐구자" 처럼 한 덩어리로 줄여.',
    '사람 이름처럼 들리는 건 쓰지 마. 명사를 셋 이상 붙이지 마.',
    '명함에 들어갈 문구야. 10자 안팎으로 짧게 써.',
    '따옴표와 번호 없이, 서로 다른 후보 여덟 개를 줄바꿈으로 나눠서 써.',
  ].join(' '),
  jobseeker: [
    '당신은 사람을 한 줄로 소개하는 문구를 만드는 사람이에요.',
    '한 말에 나온 표현을 재료로, 명함에 넣을 짧은 문구를 하나 만들어 주세요.',
    '"~형 인재" 처럼 유형으로 분류하지 마세요. 잘하고 못하고를 말하지 마세요.',
    '쓴 말을 그대로 옮기지 마세요. 같은 뜻을 다른 표현으로 바꿔서 써주세요.',
    '무엇을 묻고 답한 건지 보고 쓰세요. 싫다고 답한 걸 좋아하는 것처럼 만들지 마세요.',
    '"기록하는 사람", "귀 기울이는 동료" 처럼 동사를 넣어 써주세요. 명사만 늘어놓지 마세요.',
    '수식을 겹쳐 붙이지 마세요. "정신건강 탐구가 취미인 탐구자" 말고 "정신건강 탐구자" 처럼 줄여주세요.',
    '사람 이름처럼 들리는 건 쓰지 마세요. 명사를 셋 이상 붙이지 마세요.',
    '명함에 들어갈 문구예요. 10자 안팎으로 짧게 써주세요.',
    '따옴표와 번호 없이, 서로 다른 후보 여덟 개를 줄바꿈으로 나눠 주세요.',
  ].join(' '),
} as const

/**
 * 알맹이 없는 답만 했을 때 주는 칭호.
 *
 * 재료가 없으면 모델은 없는 걸 지어냅니다. 그럴 바엔 이렇게 대놓고 주는 게 정직해요.
 */
export const EASTER_EGG_TAGLINE = '사차원'

/**
 * **하나도 안 쓰고** 다 건너뛴 사람에게 주는 칭호.
 *
 * `사차원` 과 짝이에요. 저쪽이 "쓰긴 썼는데 알맹이가 없다" 라면, 이쪽은 "아무 말도
 * 안 했다" 입니다. 빈손으로 돌려보내는 대신 그것도 하나의 태도로 쳐주는 거예요.
 *
 * > 위험 신호 때문에 재료가 없어진 경우와 **헷갈리면 안 됩니다.** 힘든 말을 적은
 * > 사람에게 농담을 돌려주는 꼴이 돼요. 그쪽은 호출 전에 갈라내고 여기까지 오지
 * > 않습니다. (`containsRiskSignal`, WarmupRoute)
 */
export const SILENT_TAGLINE = '침묵자'

/**
 * 알맹이가 없는 응답인지 봐요.
 *
 * 자음만 두드리거나(`ㅁㄴㅇㄹ`) 숫자만 채우고(`12345`) 넘어가는 경우가 있는데,
 * 모델은 그래도 **그럴듯한 칭호를 지어냅니다.** 재료에 정보가 없는데 결과가
 * 나오면 안 돼요. 세 가지로 거릅니다.
 *
 * 1. 한글 음절(가–힣)도 영문자도 없으면 — 숫자·기호·낱자만 두드린 것
 * 2. 같은 글자만 반복하면 — `아아아아`, `1111`
 * 3. 길이에 비해 글자 종류가 너무 적으면 — `가나가나가나`
 *
 * 짧은 진짜 답(`러닝`, `그림`)은 통과해야 하니 2·3번은 길이 조건을 붙였어요.
 */
export function looksMeaningless(text: string): boolean {
  const t = text.replace(/\s/g, '')
  if (t === '') return true

  // 숫자·기호·낱자만 있는 경우. 낱자(ㄱ–ㅎ, ㅏ–ㅣ)는 음절이 아니라 여기서 걸려요.
  if (!/[가-힣a-zA-Z]/.test(t)) return true

  const distinct = new Set(t).size
  if (distinct === 1) return true
  if (t.length >= 5 && distinct <= 2) return true

  return false
}

/**
 * 진로를 대신 정해주는 말.
 *
 * 대화 캐릭터는 **듣고 되묻는 역할**이에요. "너는 디자이너가 어울려" 처럼 진로를
 * 판정하기 시작하면 `CLAUDE.md §1` 이 갈라둔 선을 넘습니다 — 적성 판정은 규준을
 * 가진 쪽(커리어넷)만 할 수 있는 일이에요.
 *
 * ## 대화를 죽이지 않는 선에서
 *
 * "한번 해보는 건 어때?" 같은 평범한 반응까지 막으면 대화가 안 됩니다. 그래서
 * **진로·적성을 못박는 표현만** 잡아요.
 *
 * ```
 * ❌ "너한테는 디자인 쪽이 잘 맞아"     적성 판정
 * ❌ "OO학과를 추천해"                 진로 결정 대행
 * ⭕ "그 얘기 할 때 표정이 달라지네요"   관찰
 * ⭕ "그건 언제부터 좋아했어요?"        되묻기
 * ```
 */
const CAREER_VERDICT = [
  '적성에 맞',
  '적성이',
  '잘 맞아',
  '잘 맞을',
  '어울려',
  '어울리는 직업',
  '추천해',
  '추천드',
  '추천합니',
  '진로로 삼',
  '전공을 선택',
  '직업을 선택',
]

/** 대화 한 마디의 길이. 너무 길면 대화가 아니라 강의가 돼요. */
const MIN_REPLY_CHARS = 4
const MAX_REPLY_CHARS = 200

/**
 * 캐릭터의 한 마디를 다듬어요.
 *
 * 자유 대화라 **턴마다** 걸러야 합니다. 문답은 제출된 묶음을 한 번 보면 됐지만,
 * 대화는 모델이 매 턴 새로 말하니 매번 검사해요.
 *
 * 걸리면 `null` 을 돌려주고, 호출부가 다시 뽑거나 대화를 멈춥니다.
 * **억지로 고쳐 쓰지 않아요** — 반쯤 지운 문장은 더 이상해집니다.
 */
export function sanitizeReply(raw: string): string | null {
  const text = trimToCompleteSentence(stripMarkup(raw))

  if (text.length < MIN_REPLY_CHARS) return null
  if (text.length > MAX_REPLY_CHARS) return null

  if (violatesExpressionRules(text)) return null
  if (ABILITY_CLAIMS.some((word) => text.includes(word))) return null
  if (TYPE_LABELS.some((word) => text.includes(word))) return null
  if (CAREER_VERDICT.some((word) => text.includes(word))) return null
  if (looksLikeGhostwriting(text)) return null

  // 해요체로 진행해요. "당신" 은 번역투로 읽히고 거리감을 줍니다.
  if (text.includes('당신')) return null

  return text
}

/**
 * 메모 한 줄의 길이. 메모지에 손글씨처럼 들어갈 분량이에요.
 */
const MIN_NOTE_LINE_CHARS = 6
const MAX_NOTE_LINE_CHARS = 60

/**
 * 대화가 끝난 뒤 캐릭터가 남기는 메모.
 *
 * ## 칭찬은 되지만 평가는 안 됩니다
 *
 * "칭찬이나 응원을 섞은" 메모가 목표인데, §7 이 능력 단정을 막아요. 경계는
 * **단정하느냐**에 있습니다.
 *
 * ```
 * ❌ "표현력이 뛰어나시네요"            능력 평가 → ABILITY_CLAIMS 에 걸림
 * ⭕ "그림 얘기 할 때 말이 빨라지셨어요"  관찰
 * ⭕ "솔직하게 말해줘서 좋았어요"        응원
 * ```
 *
 * ## 자소서가 되면 안 돼요
 *
 * §7 이 "그대로 옮겨 쓸 수 있는 글로 제시하지 말고, 대신 작성하지도 마세요" 라고
 * 못박고 있습니다. 지금 쓰는 문항에 `usedIn: "지원동기"` 같은 필드가 붙어 있어서
 * **모델이 그쪽으로 새기 쉬워요.** `looksLikeGhostwriting` 이 막습니다.
 *
 * 걸린 줄은 **버리고 나머지만** 씁니다. 한 줄이 이상하다고 메모 전체를 버리면
 * 사용자는 빈손이 돼요.
 */
export function sanitizeNoteLines(raw: string, max = 4): string[] {
  // 줄을 **먼저** 나눠요. stripMarkup 이 줄바꿈을 공백으로 눌러버려서,
  // 순서를 바꾸면 메모 전체가 한 줄로 붙습니다.
  const lines = raw
    .split(/[\r\n]+/)
    .map((line) => stripMarkup(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')))
    .filter((line) => line !== '')

  const kept: string[] = []
  for (const line of lines) {
    if (kept.length >= max) break

    if (line.length < MIN_NOTE_LINE_CHARS) continue
    if (line.length > MAX_NOTE_LINE_CHARS) continue
    if (violatesExpressionRules(line)) continue
    if (ABILITY_CLAIMS.some((word) => line.includes(word))) continue
    if (TYPE_LABELS.some((word) => line.includes(word))) continue
    if (CAREER_VERDICT.some((word) => line.includes(word))) continue
    if (looksLikeGhostwriting(line)) continue
    if (line.includes('당신')) continue
    if (kept.includes(line)) continue

    kept.push(line)
  }
  return kept
}

/**
 * 명함에 들어가니 짧아야 해요.
 *
 * 물리적 한계는 27자쯤이지만(폭 1063px, 34px 글꼴), **훨씬 낮게 잡습니다.**
 * 20자짜리 문장은 칭호가 아니라 설명문으로 읽혀요. 프롬프트로 10자 안팎을 요청하고,
 * 여기서 그보다 조금 넘는 선까지만 받습니다. 넘으면 버리고 다시 뽑게 둬요.
 */
const MAX_TAGLINE_CHARS = 16
const MIN_TAGLINE_CHARS = 2

/**
 * 유형으로 규정하는 말. §7 의 "당신의 유형은 X입니다" 에 해당해요.
 * 모델이 "탐색형", "도전형 인재" 같은 걸 잘 만들어내서 막습니다.
 */
const TYPE_LABELS = ['유형', '형 인재', '형인재', '타입', '스타일의 사람']

/**
 * 말이 끊긴 문구를 잡아내요.
 *
 * "창조적 소통가로" 처럼 **조사로 끝나면** 뒤에 말이 더 붙을 자리예요.
 * 명함에 그대로 박으면 어색합니다. 버리고 다시 뽑게 둡니다.
 */
const TRAILING_PARTICLE = /(으로|로|는|은|이|가|을|를|와|과|의|에|에서|하는|되는|고|며|면서|하며)$/

/**
 * 명사만 줄줄이 붙인 문구를 잡아내요.
 *
 * "공감의 귀의 마스터" 처럼 `의` 가 두 번 이상 나오면 명사 나열입니다.
 * 칭호는 `"귀 기울이는 친구"` 처럼 **동사가 하나 들어간** 형태가 읽기 좋아요.
 */
function tooManyNouns(text: string): boolean {
  return (text.match(/의\s/g) ?? []).length >= 2
}

/**
 * 여러 후보를 한 번의 생성에서 뽑아요.
 *
 * 후보마다 따로 부르면 GPU 시간이 배로 듭니다(락으로 직렬 처리라 더 그래요).
 * 한 번에 두 줄을 받아 각각 거른 뒤, 살아남은 것만 돌려줍니다.
 *
 * 목록 기호(`1.`, `-`, `•`)를 붙여 오는 일이 잦아서 함께 벗겨냅니다.
 */
export function sanitizeTaglines(raw: string, max = 2): string[] {
  const out: string[] = []

  for (const line of raw.split(/[\r\n]+/)) {
    const stripped = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '')
    const one = sanitizeTagline(stripped)
    if (one !== null && !out.includes(one)) out.push(one)
    if (out.length >= max) break
  }

  return out
}

export function sanitizeTagline(raw: string): string | null {
  // 모델이 따옴표로 감싸는 일이 잦아요. 벗겨냅니다.
  const text = raw
    .trim()
    // 모델이 마크다운 강조를 붙여 옵니다. 명함에 별표가 그대로 찍혀요.
    .replace(/\*+/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  /*
   * 모델이 두 문구를 이어 붙여 줍니다. 명함 한 줄에는 안 들어가요. 앞부분만 취합니다.
   *
   * 
   */
  const head = text.split(/[,·、:：—–]/)[0].trim()

  if (head.length < MIN_TAGLINE_CHARS) return null
  if (head.length > MAX_TAGLINE_CHARS) return null
  if (violatesExpressionRules(head)) return null
  if (ABILITY_CLAIMS.some((word) => head.includes(word))) return null
  if (TYPE_LABELS.some((word) => head.includes(word))) return null
  if (TRAILING_PARTICLE.test(head)) return null
  if (tooManyNouns(head)) return null
  return head
}

interface FeedbackEntry {
  question: string
  answer: string
}

interface FeedbackBody {
  track?: unknown
  /**
   * 문항과 응답 쌍.
   *
   * **정서적 신호 문항(§8)은 프론트에서 빼고 보냅니다.** 그 응답을 근거로
   * 부정적 판단 문구를 만들면 안 되기 때문이에요.
   */
  entries?: unknown
}

interface FollowupBody {
  /** 제시어(문항 텍스트). 자체 문항 JSON에서 프론트가 실어 보내요. */
  question?: unknown
  /** 사용자가 쓴 응답. 로그·에러에 절대 남기지 않아요. (CLAUDE.md §2.8) */
  answer?: unknown
  /** 'teen' | 'jobseeker'. 없으면 teen 으로 봐요. */
  track?: unknown
}

interface TalkTurn {
  role: 'user' | 'character'
  text: string
}

interface TalkBody {
  characterId?: string
  turns?: TalkTurn[]
}

function isTurn(value: unknown): value is TalkTurn {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (v.role === 'user' || v.role === 'character') && typeof v.text === 'string'
}

function isEntry(value: unknown): value is FeedbackEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.question === 'string' && typeof entry.answer === 'string'
}

export async function aiRoutes(app: FastifyInstance) {
  app.get('/api/ai/health', async (_request, reply) => {
    return reply.send(await aiHealth())
  })

  app.post<{ Body: FeedbackBody }>('/api/ai/feedback', async (request, reply) => {
    const { track, entries } = request.body ?? {}

    if (!Array.isArray(entries) || !entries.every(isEntry)) {
      return reply.status(400).send({ error: '응답 목록이 필요해요.' })
    }

    /*
     * 위험 신호가 있는 응답은 **입력에서 뺍니다.** 그 말을 근거로 피드백을 쓰면
     * 안 돼요. 하나라도 걸리면 피드백 자체를 만들지 않습니다 — 다른 문항만 골라
     * 밝은 이야기를 쓰는 게 더 부적절하기 때문입니다.
     */
    if (entries.some((entry) => containsRiskSignal(entry.answer))) {
      return reply.send({ available: false, feedback: null, blocked: 'risk' })
    }

    const usable = entries.filter((entry) => entry.answer.trim() !== '')
    // 두어 개로는 짚을 게 없어요. 억지 피드백을 만드느니 안 만듭니다.
    if (usable.length < 3) {
      return reply.send({ available: false, feedback: null })
    }

    const profile = track === 'jobseeker' ? FEEDBACK_PROFILES.jobseeker : FEEDBACK_PROFILES.teen
    const body = usable
      .map((entry) => `- ${entry.question} → ${entry.answer}`)
      .join(NEWLINE)

    try {
      const raw = await complete({
        system: profile.system,
        useAdapter: profile.useAdapter,
        prompt: `아래는 사람이 자기 이야기로 답한 내용이야.${NEWLINE}${NEWLINE}${body}${NEWLINE}${NEWLINE}여기서 눈에 띄는 점 하나와 다음에 해볼 만한 것 하나:`,
        maxNewTokens: 200,
        temperature: 0.7,
      })

      const feedback = sanitizeFeedback(raw, track === 'jobseeker' ? 'jobseeker' : 'teen')
      return reply.send({ available: feedback !== null, feedback })
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        request.log.warn({ reason: error.message }, 'ai feedback 사용 불가')
        return reply.send({ available: false, feedback: null })
      }
      throw error
    }
  })

  app.post<{ Body: FeedbackBody }>('/api/ai/tagline', async (request, reply) => {
    const { track, entries } = request.body ?? {}

    if (!Array.isArray(entries) || !entries.every(isEntry)) {
      return reply.status(400).send({ error: '응답 목록이 필요해요.' })
    }

    // 위험 신호가 있으면 만들지 않아요. 그 말로 명함 문구를 뽑을 수는 없습니다.
    if (entries.some((entry) => containsRiskSignal(entry.answer))) {
      return reply.send({ available: false, taglines: [], blocked: 'risk' })
    }

    /*
     * 응답 **하나만** 있어도 만듭니다. 워밍업은 문항 하나 답할 때마다 부르거든요.
     * (명함 화면은 모아둔 응답을 한꺼번에 넘깁니다)
     */
    /*
     * **알맹이 없는 응답은 뺍니다.** 자음만 두드린 입력으로도 모델은 그럴듯한
     * 칭호를 지어내는데, 재료에 없는 걸 만들어내는 셈이라 내보내면 안 돼요.
     */
    const usable = entries.filter(
      (entry) =>
        entry.answer.trim() !== '' &&
        !looksMeaningless(entry.answer) &&
        // 어려움 신호가 있는 응답은 **그것만** 빼요. 요청 전체를 막지 않습니다.
        !containsDistressSignal(entry.answer),
    )

    if (usable.length < 1) {
      /*
       * 답은 했는데 **전부 알맹이가 없는** 경우예요. 자음만 두드리고 넘어간 거죠.
       * 빈손으로 보내는 대신 이스터에그를 하나 줍니다. 지어낸 칭호가 아니라
       * "재료가 없었다"는 걸 유머로 알려주는 쪽이에요.
       */
      const answered = entries.some((entry) => entry.answer.trim() !== '')
      if (answered) {
        return reply.send({ available: true, taglines: [EASTER_EGG_TAGLINE] })
      }

      // 한 글자도 안 쓴 경우. 이쪽도 빈손으로 보내지 않아요.
      return reply.send({ available: true, taglines: [SILENT_TAGLINE] })
    }

    const system = track === 'jobseeker' ? TAGLINE_PROFILES.jobseeker : TAGLINE_PROFILES.teen

    /*
     * **문항을 함께 넘깁니다.** 답변만 주면 맥락을 몰라 뜻이 뒤집혀요.
     * "'이건 내 길이 아니다' 싶었던 건?" 에 "숫자 계산 많은 일" 이라고 답했는데
     * 답변만 보고 "숫자의 마스터" 라는 칭호를 만든 사례가 있었습니다.
     */
    const body = usable
      .map((entry) => `- ${entry.question} → ${entry.answer}`)
      .join(NEWLINE)

    /*
     * 한 번의 생성에서 여러 후보를 뽑아요. 짧게 여러 번 부르면 GPU 시간이 배로 듭니다.
     *
     * **넉넉히 요청하고 걸러냅니다.** 길이 상한(16자)에 걸려 버려지는 게 많아서,
     * 다섯 개만 요청하면 한 개도 안 남는 경우가 생겼어요. 여덟 개를 받아
     * 살아남은 것 중 최대 다섯 개를 씁니다.
     */
    const draw = async () => {
      const raw = await complete({
        system,
        useAdapter: false,
        prompt: `아래는 사람이 자기 이야기로 답한 내용이야.${NEWLINE}${NEWLINE}${body}${NEWLINE}${NEWLINE}명함에 넣을 후보 여덟 개:`,
        // 여덟 줄이 다 나올 만큼. 짧으면 마지막 후보가 잘려서 버려집니다.
        // 로컬 제공자는 200 이 상한이라 그쪽에서 잘라요. 상용 API 는 더 줄 수 있으니
        // Vertex 로 옮긴 뒤 후보가 잘리면 여기를 올리세요. (lib/aiLocal.ts)
        maxNewTokens: 200,
        temperature: 0.9,
      })
      return sanitizeTaglines(raw, 5)
    }

    try {
      /*
       * 하나도 안 남으면 **한 번만** 다시 뽑아요.
       *
       * 대여섯 번에 한 번꼴로 전부 길이 상한에 걸립니다. 사용자가 문답을 마치고 받는
       * 화면이라 빈손으로 보내면 안 돼요. 실패했을 때만 추가 비용이 듭니다.
       */
      let taglines = await draw()
      if (taglines.length === 0) taglines = await draw()

      return reply.send({ available: taglines.length > 0, taglines })
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        request.log.warn({ reason: error.message }, 'ai tagline 사용 불가')
        return reply.send({ available: false, taglines: [] })
      }
      throw error
    }
  })

  app.post<{ Body: FollowupBody }>('/api/ai/followup', async (request, reply) => {
    const { question, answer, track } = request.body ?? {}

    if (typeof question !== 'string' || question.trim() === '') {
      return reply.status(400).send({ error: '제시어가 필요해요.' })
    }
    if (typeof answer !== 'string') {
      return reply.status(400).send({ error: '응답이 필요해요.' })
    }

    // 응답이 비어 있으면 모델을 부를 것도 없어요. 프론트의 기존 보조질문으로 갑니다.
    if (answer.trim() === '') {
      return reply.send({ available: false, followup: null })
    }

    /*
     * 위험 신호가 있으면 **모델을 부르지 않습니다.** 그 말을 받아 되묻는 건
     * 지금 필요한 대응이 아니에요. 프론트가 상담 자원을 안내합니다.
     * 클라이언트도 같은 검사를 하지만 서버는 그걸 믿지 않아요. (lib/safety.ts)
     */
    if (containsRiskSignal(answer)) {
      return reply.send({ available: false, followup: null, blocked: 'risk' })
    }

    try {
      const profile = profileFor(track)
      const raw = await complete({
        system: profile.system,
        useAdapter: profile.useAdapter,
        prompt: `제시어: ${question}\n응답: ${answer}\n\n되물을 질문 하나:`,
        maxNewTokens: 40,
        temperature: 0.8,
      })

      const followup = extractQuestion(raw)

      // 모델이 질문 형태를 못 만들었으면 억지로 쓰지 않아요.
      return reply.send({ available: followup !== null, followup })
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        // 사용자 응답은 로그에 남기지 않아요. 사유 문구만 남깁니다. (CLAUDE.md §2.8)
        request.log.warn({ reason: error.message }, 'ai followup 사용 불가')
        return reply.send({ available: false, followup: null })
      }
      throw error
    }
  })
  /** 고르기 화면용 목록. **시스템 프롬프트는 내보내지 않아요.** */
  app.get('/api/ai/characters', async (_request, reply) => {
    return reply.send({
      characters: CHARACTERS.map(({ id, name, blurb, opening }) => ({ id, name, blurb, opening })),
      minTurns: TALK_MIN_TURNS,
      maxTurns: TALK_MAX_TURNS,
    })
  })

  /**
   * 캐릭터와 한 턴 주고받기.
   *
   * 서버는 대화를 들고 있지 않아요. **매 턴 전체 대화를 받습니다.** 저장은 기기
   * 안에서만 일어나고, 서버에는 아무것도 남지 않아요. (CLAUDE.md §2.8)
   *
   * ## 두 신호를 다르게 다뤄요
   *
   * | | 자살·자해 | 우울·번아웃 등 |
   * |---|---|---|
   * | 모델 호출 | **막음** | 그대로 진행 |
   * | 상담 안내 | 띄움 | 띄움 |
   *
   * 어려움을 말했다고 대화를 끊으면 **가장 필요한 순간에 앱이 등을 돌리는** 셈이에요.
   * 캐릭터가 다정하게 받는 건 §8 이 금지한 "부정적 판단"이 아닙니다. 반면 자살·자해
   * 발화를 재료로 모델을 부르는 건 안 돼요.
   */
  app.post<{ Body: TalkBody }>('/api/ai/talk', async (request, reply) => {
    const { characterId, turns } = request.body ?? {}

    const character = characterById(characterId)
    if (character === undefined) {
      return reply.status(400).send({ error: '없는 캐릭터예요.' })
    }
    if (!Array.isArray(turns) || !turns.every(isTurn) || turns.length === 0) {
      return reply.status(400).send({ error: '대화 내용이 필요해요.' })
    }

    const last = turns[turns.length - 1]!
    if (last.role !== 'user') {
      return reply.status(400).send({ error: '마지막은 사용자 차례여야 해요.' })
    }

    const spoken = turns.filter((turn) => turn.role === 'user').length
    if (spoken > TALK_MAX_TURNS) {
      return reply.status(400).send({ error: '대화가 너무 길어요.' })
    }

    // 자살·자해 발화는 모델에 넘기지 않아요. 그 말을 받아 대화를 잇는 건 우리 몫이 아닙니다.
    if (containsRiskSignal(last.text)) {
      return reply.send({ available: false, reply: null, blocked: 'risk' })
    }

    /*
     * 지난 턴 중 위험 신호가 있던 것은 **맥락에서도 뺍니다.** 그 턴은 이미 모델 없이
     * 넘어갔는데, 다음 턴에 재료로 들어가면 결국 같은 일이 됩니다.
     */
    const history = turns
      .filter((turn) => !(turn.role === 'user' && containsRiskSignal(turn.text)))
      .map((turn) => `${turn.role === 'user' ? '상대' : '너'}: ${turn.text}`)
      .join(NEWLINE)

    const prompt = `${history}${NEWLINE}너:`

    const say = async () => {
      const raw = await complete({
        system: character.system,
        useAdapter: false,
        prompt,
        maxNewTokens: 120,
        temperature: 0.9,
      })
      return sanitizeReply(raw)
    }

    try {
      // 걸러져서 빈손이면 한 번 더. 온도가 높아 두 번째는 다른 말이 나와요.
      const text = (await say()) ?? (await say())
      return reply.send({ available: text !== null, reply: text })
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        // 사용자 발화는 로그에 남기지 않아요. 사유 문구만 남깁니다. (CLAUDE.md §2.8)
        request.log.warn({ reason: error.message }, 'ai talk 사용 불가')
        return reply.send({ available: false, reply: null })
      }
      throw error
    }
  })

  /**
   * 대화를 메모 몇 줄로 정리해요.
   *
   * **판정이 아니라 인상입니다.** "이렇게 보였어요" 에서 멈춰요. 인상은 주관적
   * 진술이라 §7 의 유형 규정을 피해 가지만, 능력 단정으로 새면 그대로 걸립니다.
   * `sanitizeNoteLines` 가 줄 단위로 걸러요.
   */
  app.post<{ Body: TalkBody }>('/api/ai/note', async (request, reply) => {
    const { characterId, turns } = request.body ?? {}

    const character = characterById(characterId)
    if (character === undefined) {
      return reply.status(400).send({ error: '없는 캐릭터예요.' })
    }
    if (!Array.isArray(turns) || !turns.every(isTurn) || turns.length === 0) {
      return reply.status(400).send({ error: '대화 내용이 필요해요.' })
    }

    /*
     * 위험 신호가 있던 턴은 재료에서 빼요. 그 말을 근거로 메모를 쓸 수는 없습니다.
     * 어려움 신호(우울·번아웃)는 남깁니다 — 다정하게 받은 대화까지 지우면 메모가
     * 그 사람의 이야기가 아니게 돼요. (CLAUDE.md §8)
     */
    const said = turns
      .filter((turn) => turn.role === 'user' && !containsRiskSignal(turn.text))
      .map((turn) => turn.text.trim())
      .filter((text) => text !== '' && !looksMeaningless(text))

    if (said.length === 0) {
      return reply.send({ available: false, lines: [] })
    }

    const system = [
      character.system,
      '이제 대화를 마치고 상대에게 건넬 쪽지를 써.',
      // 롤링페이퍼처럼 쪽지 하나에 이야깃거리 하나가 들어가요.
      '대화에서 나온 이야깃거리마다 한 줄씩 써. 줄마다 서로 다른 주제를 골라.',
      '상대가 한 말에서 기억에 남는 것을 짚어줘. 없는 얘기를 지어내지 마.',
      '능력을 평가하지 마. 잘한다, 뛰어나다, 부족하다 같은 말을 쓰지 마.',
      '대신 무엇을 말했는지, 어떤 순간에 말이 많아졌는지를 적어.',
      '마지막 한 줄은 응원으로 마무리해.',
      '자기소개서 문장을 써주지 마.',
      '세 줄에서 다섯 줄, 각 줄은 40자 안팎으로 줄바꿈해서 써.',
    ].join(' ')

    const body = said.map((text) => `- ${text}`).join(NEWLINE)
    const prompt = `상대가 한 말:${NEWLINE}${body}${NEWLINE}${NEWLINE}메모에 남길 세 줄:`

    const draw = async () => {
      const raw = await complete({
        system,
        useAdapter: false,
        prompt,
        // 다섯 줄이 다 나올 만큼. 짧으면 마지막 줄이 잘려서 버려집니다.
        maxNewTokens: 200,
        temperature: 0.8,
      })
      return sanitizeNoteLines(raw, 5)
    }

    try {
      // 필터에 다 걸려서 빈손이면 한 번 더 뽑아요.
      let lines = await draw()
      if (lines.length === 0) lines = await draw()

      return reply.send({ available: lines.length > 0, lines, from: character.name })
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        request.log.warn({ reason: error.message }, 'ai note 사용 불가')
        return reply.send({ available: false, lines: [] })
      }
      throw error
    }
  })

}
