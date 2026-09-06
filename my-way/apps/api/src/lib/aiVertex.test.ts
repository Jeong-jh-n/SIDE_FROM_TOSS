import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * 리전이 서울에 고정돼 있는지.
 *
 * **데이터가 국외로 나가느냐가 걸린 검사예요.** Vertex 의 기본 리전은 `us-central1`
 * 이라, 리전을 환경변수로 빼두면 값이 비는 순간 조용히 미국으로 나갑니다. 실패해도
 * 눈에 안 보이는 종류의 사고라 소스를 직접 읽어 확인해요.
 *
 * `FEED` 의 확정 사항입니다 — "리전: asia-northeast3 상수로 하드코딩. 환경변수 금지".
 */

const source = readFileSync(fileURLToPath(new URL('./aiVertex.ts', import.meta.url)), 'utf8')

describe('Vertex 리전 고정', () => {
  it('서울 리전이 상수로 박혀 있어요', () => {
    expect(source).toContain("const REGION = 'asia-northeast3'")
  })

  it('리전을 환경변수에서 읽지 않아요', () => {
    // process.env 에서 리전을 읽는 코드가 생기면 여기서 걸려요.
    const envReads = source.match(/process\.env\.[A-Z_]+/g) ?? []
    for (const read of envReads) {
      expect(read).not.toMatch(/REGION|LOCATION/)
    }
  })

  it('전역 엔드포인트를 쓰지 않아요', () => {
    // 전역 엔드포인트는 "리전 격리 또는 데이터 레지던시 보장 없음" 이 명시돼 있어요.
    expect(source).not.toContain('aiplatform.googleapis.com/v1/projects')
    expect(source).toContain('${REGION}-aiplatform.googleapis.com')
  })

  it('엔드포인트 경로의 location 도 같은 상수를 써요', () => {
    expect(source).toContain('/locations/${REGION}')
  })

  it('서울에서 쓸 수 있는 모델로 고정돼 있어요', () => {
    // 서울 리전 생성 모델은 2.5 Flash 하나뿐이에요. 바꾸려면 지원 리전을 먼저 확인.
    expect(source).toContain("const MODEL = 'gemini-2.5-flash'")
  })
})

describe('제공자 선택', () => {
  it('알 수 없는 AI_PROVIDER 는 로컬로 떨어져요', async () => {
    process.env.AI_PROVIDER = '없는제공자'
    const { providerName } = await import('./ai.js')
    expect(providerName()).toBe('local')
  })

  it('vertex 로 지정하면 vertex 를 써요', async () => {
    process.env.AI_PROVIDER = 'vertex'
    const { providerName } = await import('./ai.js')
    expect(providerName()).toBe('vertex')
  })

  it('설정이 없으면 로컬이에요', async () => {
    delete process.env.AI_PROVIDER
    const { providerName } = await import('./ai.js')
    expect(providerName()).toBe('local')
  })
})

describe('자격증명이 없을 때', () => {
  it('health 가 터지지 않고 미설정으로 알려줘요', async () => {
    // AI 가 없어도 앱은 돌아가야 해요. 설정 미완료가 500 이 되면 안 됩니다.
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.VERTEX_ACCESS_TOKEN
    const { vertexProvider } = await import('./aiVertex.js')

    const health = await vertexProvider.health()
    expect(health.ready).toBe(false)
    expect(health.region).toBe('asia-northeast3')
    expect(health.error).toBeTruthy()
  })

  it('complete 는 AiUnavailableError 로 실패해요', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT
    const { vertexProvider } = await import('./aiVertex.js')
    const { AiUnavailableError } = await import('./aiTypes.js')

    await expect(vertexProvider.complete({ prompt: '안녕' })).rejects.toBeInstanceOf(
      AiUnavailableError,
    )
  })
})
