import { describe, expect, it } from 'vitest'
import {
  extractQuestion,
  looksLikeGhostwriting,
  sanitizeFeedback,
  EASTER_EGG_TAGLINE,
  looksMeaningless,
  sanitizeTagline,
  violatesExpressionRules,
} from './ai.js'

/**
 * 모델 출력 거르기 테스트.
 *
 * 학습 데이터가 문장완성형이라 모델이 **질문 대신 학생 말투의 서술**을 뱉는 일이
 * 잦습니다. 실제 관측된 출력을 그대로 케이스로 넣었어요.
 */

describe('violatesExpressionRules — CLAUDE.md §7 금지 표현', () => {
  it.each([
    '너는 진로성숙도가 낮은 편이야',
    '검사 결과를 보면 어때?',
    '네 점수는 어느 정도라고 생각해?',
    '너의 유형은 뭐라고 생각해?',
    '상위 몇 퍼센트일 것 같아?',
  ])('판정성 표현을 걸러요: %s', (text) => {
    expect(violatesExpressionRules(text)).toBe(true)
  })

  it.each(['어떤 일을 할 때 제일 즐거워?', '그렇게 생각한 계기가 있어?'])(
    '평범한 되묻기는 통과시켜요: %s',
    (text) => {
      expect(violatesExpressionRules(text)).toBe(false)
    },
  )
})

describe('extractQuestion', () => {
  it('질문 한 문장을 뽑아내요', () => {
    expect(extractQuestion('성적이 떨어지는 것을 막기 위해 노력하는 중인가?')).toBe(
      '성적이 떨어지는 것을 막기 위해 노력하는 중인가?',
    )
  })

  it('여러 문장이 와도 첫 질문까지만 취해요', () => {
    expect(extractQuestion('어떤 게 제일 걱정돼? 그리고 또 뭐가 있어?')).toBe(
      '어떤 게 제일 걱정돼?',
    )
  })

  it('질문이 아닌 서술은 버려요 — 실제 모델 출력', () => {
    // 관측된 출력. 학생 목소리의 서술이라 보조질문으로 쓸 수 없어요.
    expect(
      extractQuestion(
        '성적이 떨어져서 못 갈 거 같다는 생각을 할 때마다 다른 걸 생각하면서 극복해 나가려 노력한다',
      ),
    ).toBeNull()
  })

  it('빈 출력은 null 이에요', () => {
    expect(extractQuestion('   ')).toBeNull()
  })

  it('질문 형태여도 §7 금지 표현이 있으면 버려요', () => {
    expect(extractQuestion('네 진로성숙도 점수는 어느 정도야?')).toBeNull()
  })

  it('한 단어짜리 되물음은 버려요 — 실제 모델 출력', () => {
    // 관측된 출력. 형식은 질문이지만 이야기를 끌어내지 못하고 답을 좁혀요.
    expect(extractQuestion('유튜버?')).toBeNull()
  })

  it('너무 긴 문장은 보조질문으로 쓰지 않아요', () => {
    expect(extractQuestion(`${'가'.repeat(120)}?`)).toBeNull()
  })
})

describe('sanitizeFeedback — 결과 피드백 거르기', () => {
  it('마크다운 강조와 줄바꿈을 걷어내요 — 실제 모델 출력', () => {
    const raw = '눈에 띄는 점은 **다양한 재능**을 가지고 있다는 거야.\n\n다음에 해볼 만한 건 미술 동아리야.'
    expect(sanitizeFeedback(raw)).toBe(
      '눈에 띄는 점은 다양한 재능을 가지고 있다는 거야. 다음에 해볼 만한 건 미술 동아리야.',
    )
  })

  it('§7 금지 표현이 있으면 통째로 버려요', () => {
    expect(sanitizeFeedback('네 진로성숙도는 낮은 편이야. 더 알아보면 좋겠어.')).toBeNull()
  })

  it('너무 짧거나 긴 건 버려요', () => {
    expect(sanitizeFeedback('좋아')).toBeNull()
    expect(sanitizeFeedback(`${'가'.repeat(700)}.`)).toBeNull()
  })

  it('평범한 피드백은 통과해요', () => {
    const text = '그림 그리는 걸 좋아한다는 얘기가 여러 번 나왔어. 관련 활동을 한번 찾아보면 어떨까?'
    expect(sanitizeFeedback(text)).toBe(text)
  })
})

describe('looksLikeGhostwriting — 자소서 대필 차단 (CLAUDE.md §7)', () => {
  it('따옴표 안에 자소서 문장을 써주면 잡아내요 — 실제 모델 출력', () => {
    // 관측된 출력. §7 이 "자기소개서를 대신 작성하지 마세요"라고 금지한 형태예요.
    const raw =
      '예를 들어, "프로토타입 제작 중 기술적 난관에 부딪혔을 때, 피그마 독학 경험을 바탕으로 해결 방안을 모색하며 최종적으로 앱의 핵심 기능을 구현할 수 있었습니다"와 같은 내용을 포함해보세요.'
    expect(looksLikeGhostwriting(raw)).toBe(true)
    expect(sanitizeFeedback(raw)).toBeNull()
  })

  it('짧은 인용은 대필로 보지 않아요', () => {
    expect(looksLikeGhostwriting('"피그마"라는 말이 여러 번 나왔어요.')).toBe(false)
  })
})

describe('sanitizeFeedback — 능력 단정 차단 (CLAUDE.md §7)', () => {
  it('칭찬이어도 능력을 못박으면 버려요 — 실제 모델 출력', () => {
    // "경계선은 단정하느냐에 있습니다"(§7). 긍정이어도 능력 수준 판정은 자체 문항이 할 일이 아니에요.
    expect(
      sanitizeFeedback('창의력과 표현 능력이 뛰어나 미술과 국어에 관심이 많다는 점이 보여.'),
    ).toBeNull()
  })

  it('한 말과 한 일을 짚는 건 통과해요', () => {
    const text = '그림 얘기가 여러 번 나왔어. 관련 활동을 한번 찾아보면 어떨까?'
    expect(sanitizeFeedback(text)).toBe(text)
  })

  it('반말 트랙에 "당신"이 섞이면 버려요 — 실제 모델 출력', () => {
    const raw = '진로 워크숍 참여를 고려해봐. 당신의 관심사와 능력을 발전시키는 데 도움이 될 거야.'
    expect(sanitizeFeedback(raw, 'teen')).toBeNull()
    // 해요체 트랙에서는 문제되지 않아요.
    expect(sanitizeFeedback(raw, 'jobseeker')).toBe(raw)
  })
})

describe('sanitizeFeedback — 잘린 문장 처리', () => {
  it('중간에서 끊긴 꼬리를 떼요', () => {
    // max_new_tokens 에 걸려 문장 중간에서 끊긴 출력이에요.
    const raw =
      '그림 얘기가 여러 번 나왔어. 관련 활동을 찾아보면 어떨까? 예를 들어 학교 동아리나 워크숍에 참여하면 더'
    expect(sanitizeFeedback(raw)).toBe('그림 얘기가 여러 번 나왔어. 관련 활동을 찾아보면 어떨까?')
  })

  it('제대로 끝난 문장은 건드리지 않아요', () => {
    const text = '그림 얘기가 여러 번 나왔어. 관련 활동을 찾아보면 어떨까?'
    expect(sanitizeFeedback(text)).toBe(text)
  })

  it('완결 문장이 하나도 없으면 버려요', () => {
    expect(sanitizeFeedback('그림 얘기가 여러 번 나왔고 관련 활동을 찾아보면 더')).toBeNull()
  })
})

describe('sanitizeTagline — 명함 한 줄 (CLAUDE.md §7)', () => {
  it('유형으로 규정하면 버려요', () => {
    // §7 이 금지한 "당신의 유형은 X입니다" 에 해당해요. 칭호는 잘못 만들면 바로 걸립니다.
    expect(sanitizeTagline('탐색형 인재')).toBeNull()
    expect(sanitizeTagline('도전형인재')).toBeNull()
    expect(sanitizeTagline('당신의 유형')).toBeNull()
  })

  it('능력을 단정해도 버려요', () => {
    expect(sanitizeTagline('표현력이 뛰어난 사람')).toBeNull()
  })

  it('한 말에서 나온 문구는 통과해요', () => {
    expect(sanitizeTagline('그림으로 말하는 사람')).toBe('그림으로 말하는 사람')
  })

  it('마크다운 별표를 벗겨요 — 실제 모델 출력', () => {
    expect(sanitizeTagline('**무한 상상력**')).toBe('무한 상상력')
    expect(sanitizeTagline('**귀 기울이는 친구**')).toBe('귀 기울이는 친구')
  })

  it('모델이 씌운 따옴표를 벗겨요', () => {
    expect(sanitizeTagline('"기록하는 사람"')).toBe('기록하는 사람')
    expect(sanitizeTagline('“듣는 걸 좋아하는 사람”')).toBe('듣는 걸 좋아하는 사람')
  })

  it('조사로 끝나 말이 끊긴 문구는 버려요 — 실제 모델 출력', () => {
    expect(sanitizeTagline('창조적 소통가로')).toBeNull()
    expect(sanitizeTagline('기록하는')).toBeNull()
    expect(sanitizeTagline('친구 이야기에 귀 기울이고')).toBeNull()
    // 명사로 끝나면 통과해요.
    expect(sanitizeTagline('창의적인 듣기 마스터')).toBe('창의적인 듣기 마스터')
  })

  it('명사만 줄줄이 붙인 건 버려요', () => {
    // 칭호는 동사가 하나 들어간 형태가 읽기 좋아요.
    expect(sanitizeTagline('공감의 귀의 마스터')).toBeNull()
    // 하나뿐이면 통과해요.
    expect(sanitizeTagline('끈기의 소유자')).toBe('끈기의 소유자')
    expect(sanitizeTagline('귀 기울이는 친구')).toBe('귀 기울이는 친구')
  })

  it('명함에 안 들어갈 길이는 버려요', () => {
    expect(sanitizeTagline('가')).toBeNull()
    expect(sanitizeTagline('가'.repeat(30))).toBeNull()
  })

  it('두 문구를 이어 붙이면 앞부분만 취해요 — 실제 모델 출력', () => {
    expect(sanitizeTagline('창의적 경청자, 예술과 창조의 열정가')).toBe('창의적 경청자')
    expect(sanitizeTagline('청취의 명수: 진심으로 귀 기울입니다.')).toBe('청취의 명수')
  })

  it('줄바꿈은 공백으로 눌러요', () => {
    expect(sanitizeTagline('기록하는\n사람')).toBe('기록하는 사람')
  })
})

describe('looksMeaningless — 알맹이 없는 응답', () => {
  it.each(['ㅁㄴㅇㄹ', 'ㅋㅋㅋㅋㅋ', 'ㅇㅇ', 'ㅎㅎㅎ', 'ㅏㅏㅏ', '   ', '...', '12345', '111', '0', '99999', '!@#$%', '아아아아', '가나가나가나'])(
    '분석할 게 없으면 걸러요: %s',
    (text) => {
      // 이런 입력으로도 모델은 "내면의 빛을 밝히는 탐구자" 같은 걸 지어냅니다.
      expect(looksMeaningless(text)).toBe(true)
    },
  )

  it.each(['그림 그리기', '러닝', 'UX 디자인', '축구2팀'])('알맹이가 있으면 통과: %s', (text) => {
    expect(looksMeaningless(text)).toBe(false)
  })
})

describe('이스터에그', () => {
  it('알맹이 없는 답만 했을 때 주는 칭호가 정해져 있다', () => {
    expect(EASTER_EGG_TAGLINE).toBe('사차원')
  })

  it('이스터에그도 명함에 들어갈 수 있는 형태다', () => {
    // 길이·유형 라벨·조사 끝 검사를 통과해야 명함에 찍혀요.
    expect(sanitizeTagline(EASTER_EGG_TAGLINE)).toBe('사차원')
  })
})
