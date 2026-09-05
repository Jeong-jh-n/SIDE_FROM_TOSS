/**
 * 위험 신호 감지 — 자해·자살 관련 발화를 잡아냅니다.
 *
 * ## 왜 필요한가
 *
 * 앱인토스 정책상 AI 대화 서비스는 **"위험 키워드와 문맥을 함께 판단하는 필터링
 * 시스템"** 과 **"자살·자해 관련 발화 감지 시 안전 응답 프로토콜"** 을 갖춰야 합니다.
 * 우리 대상은 중·고등학생과 취업 스트레스 상황의 사용자예요. (CLAUDE.md §8)
 *
 * ## 두 가지를 합니다
 *
 * 1. **AI에 보내지 않습니다.** 위험 신호가 있는 응답은 모델 입력에서 제외해요.
 *    그 말을 근거로 뭔가를 생성하면 안 됩니다.
 * 2. **상담 자원을 바로 안내합니다.** 문항 번호가 아니라 **내용**을 보고 띄워요.
 *    기존 `supportFlag` 는 24문항 중 2개에만 걸려 있어서 나머지를 놓쳤습니다.
 *
 * ## 놓치는 것보다 과하게 잡는 쪽으로
 *
 * 오탐(괜찮은데 안내가 뜸)의 비용은 "안내 카드가 하나 더 보임" 입니다.
 * 미탐(위험한데 아무 일도 안 일어남)의 비용은 비교할 수 없습니다.
 * 그래서 경계가 애매하면 잡는 쪽을 택했어요.
 *
 * ## 한계 — 이건 1차 방어선입니다
 *
 * 키워드와 짧은 문맥 규칙일 뿐이라 우회하면 뚫립니다. 완전한 시스템이 아니에요.
 * 정책이 요구하는 "즉시 수정·차단 체계"와 운영 절차가 별도로 필요합니다.
 *
 * > **주의**: 같은 파일이 `apps/api/src/lib/safety.ts` 에도 있습니다.
 * > 서버는 클라이언트를 믿지 않고 한 번 더 검사해요. **고칠 때 함께 고치세요.**
 */

/**
 * 직접적인 신호. 이 표현이 있으면 문맥을 더 보지 않고 잡습니다.
 * 띄어쓰기 변형을 흡수하려고 공백을 없앤 문자열에서 찾아요.
 */
const DIRECT_SIGNALS = [
  '자살',
  '죽고싶',
  '죽고파',
  '죽어버리',
  '죽는게낫',
  '살기싫',
  '살고싶지않',
  '사라지고싶',
  '없어지고싶',
  '자해',
  '손목긋',
  '극단적선택',
  '뛰어내리',
  '유서',
  '목숨을끊',
]

/**
 * 정서적 어려움을 시사하는 말.
 *
 * 자해·자살만큼 급하진 않지만 **그냥 지나치면 안 되는** 신호예요.
 * `CLAUDE.md §8` 이 "어려움을 시사하는 응답"에 상담 자원 안내를 요구합니다.
 *
 * 실제로 진로 문답에 "우울증" 이라고 답한 사례가 있었는데, 안내가 안 뜨고
 * **"우울증 탐구자" 라는 명함 칭호가 만들어졌습니다.** 그래서 여기 넣었어요.
 *
 * 진짜 관심 주제일 수도 있습니다(심리학 전공 등). 그때는 안내 카드가 한 번 더
 * 보일 뿐이고, 놓치는 쪽보다 낫습니다.
 */
const DISTRESS_SIGNALS = ['우울', '공황', '불안장애', '무기력', '번아웃', '정신질환']

/**
 * 단독으로는 일상 표현이라 문맥이 필요한 말들.
 * 아래 `HOPELESS_CONTEXT` 와 **함께** 나올 때만 잡아요.
 */
const WEAK_SIGNALS = ['끝내고싶', '포기하고싶', '버티기힘들', '숨쉬기힘들', '아무의미없']

/** 무력감·고립을 시사하는 문맥. */
const HOPELESS_CONTEXT = [
  '더이상',
  '아무도',
  '혼자',
  '지쳤',
  '지친',
  '힘들어',
  '괴로',
  '벗어날수없',
  '방법이없',
  '희망이없',
]

/** 비교를 단순하게 하려고 공백과 일부 문장부호를 지웁니다. */
function normalize(text: string): string {
  return text.replace(/[\s.,!?~·…]/g, '')
}

export function containsRiskSignal(text: string): boolean {
  const t = normalize(text)
  if (t === '') return false

  if (DIRECT_SIGNALS.some((word) => t.includes(word))) return true

  const weak = WEAK_SIGNALS.some((word) => t.includes(word))
  if (!weak) return false

  return HOPELESS_CONTEXT.some((word) => t.includes(word))
}

/**
 * 정서적 어려움 신호인지. **위험 신호와 다루는 방식이 달라요.**
 *
 * | | 자살·자해 (`containsRiskSignal`) | 어려움 (`containsDistressSignal`) |
 * |---|---|---|
 * | AI 호출 | **요청 전체를 막음** | **그 응답만 재료에서 뺌** |
 * | 상담 안내 | 띄움 | 띄움 |
 *
 * 하나 때문에 전부 막으면 나머지 답변으로 만들 수 있는 것까지 사라지고, 사용자는
 * 왜 안 되는지도 모릅니다. 그래서 어려움 신호는 그 항목만 빼요.
 */
export function containsDistressSignal(text: string): boolean {
  const t = normalize(text)
  if (t === '') return false
  return DISTRESS_SIGNALS.some((word) => t.includes(word))
}

/** 상담 자원을 안내해야 하는지. 두 신호를 합쳐서 봐요. (CLAUDE.md §8) */
export function needsSupport(text: string): boolean {
  return containsRiskSignal(text) || containsDistressSignal(text)
}

/** 응답 목록 중 하나라도 위험 신호가 있는지. 결과 화면에서 써요. */
export function anyRiskSignal(texts: Iterable<string>): boolean {
  for (const text of texts) {
    // 안내 여부를 정하는 자리라 어려움 신호까지 봅니다.
    if (needsSupport(text)) return true
  }
  return false
}
