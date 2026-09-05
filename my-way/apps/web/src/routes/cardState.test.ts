import { describe, expect, it } from 'vitest'
import { normalize } from './CardRoute'

/**
 * 저장 구조가 바뀐 뒤에도 명함 화면이 열리는지.
 *
 * `loadState` 는 얕은 병합이라(`{...fallback, ...parsed}`) 중첩된 `info` 는
 * **저장된 것이 통째로 fallback 을 덮습니다.** 필드 이름을 `hobbies` → `hobby` 로
 * 바꾼 뒤 `saved.info.hobby` 가 undefined 가 되어 `.trim()` 에서 터졌어요.
 * 실제로 명함 화면이 흰 화면이 됐습니다.
 */
describe('normalize — 옛 저장값 복구', () => {
  it('hobbies 시절 값이 와도 빈 문자열로 채운다', () => {
    const old = {
      info: { desiredCareer: '분석가', strengths: '정리', hobbies: '러닝' },
      themeId: 'paper',
      name: '김토스',
      tagline: '',
    } as never

    const fixed = normalize(old)
    // 옛 이름(hobbies)의 값은 버리지 않고 이월해요.
    expect(fixed.info.hobby).toBe('러닝')
    expect(fixed.aiTagline).toBe('')
    expect(fixed.taglineSource).toBe('self')
    // 남아 있는 값은 지키고요.
    expect(fixed.info.strengths).toBe('정리')
    expect(fixed.name).toBe('김토스')
  })

  it('옛 이름으로 저장된 취미를 이월한다', () => {
    // 그냥 버리면 적어둔 값이 사라지고 태그가 안 뜹니다.
    expect(normalize({ info: { hobbies: '러닝, 사진' } } as never).info.hobby).toBe('러닝')
    expect(normalize({ info: { hobby1: '사진 찍기' } } as never).info.hobby).toBe('사진 찍기')
    // 새 이름이 있으면 그걸 우선해요.
    expect(normalize({ info: { hobby: '독서', hobbies: '러닝' } } as never).info.hobby).toBe('독서')
  })

  it('크래시가 나던 지점이 이제 안전하다', () => {
    const fixed = normalize({ info: {} } as never)
    expect(() => [fixed.info.strengths, fixed.info.hobby].map((v) => v.trim())).not.toThrow()
    expect(() => fixed.aiTagline.trim()).not.toThrow()
    expect(() => fixed.tagline.trim()).not.toThrow()
  })

  it('워밍업이 칭호 두 필드만 써둔 경우도 복구된다', () => {
    const fixed = normalize({ aiTagline: '귀 기울이는 친구', taglineSource: 'ai' } as never)
    expect(fixed.aiTagline).toBe('귀 기울이는 친구')
    expect(fixed.taglineSource).toBe('ai')
    expect(fixed.info.hobby).toBe('')
  })

  it('null 이나 undefined 도 견딘다', () => {
    expect(normalize(null).info.hobby).toBe('')
    expect(normalize(undefined).name).toBe('')
  })
})
