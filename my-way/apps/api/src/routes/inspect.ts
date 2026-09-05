import type { FastifyInstance } from 'fastify'
import {
  CareernetError,
  createReport,
  fetchQuestions,
  isAllowedTest,
  type ReportInput,
} from '../lib/careernet.js'
import { QUESTIONS_TTL_MS, TtlCache } from '../lib/cache.js'

const questionsCache = new TtlCache<unknown>(QUESTIONS_TTL_MS)

/**
 * 클라이언트에는 일반화된 메시지만 나갑니다. 사유는 서버 로그에만. (CLAUDE.md §4)
 * 다만 문항 조회와 결과표 생성은 사용자가 할 일이 달라서 문구를 나눠요.
 */
const QUESTIONS_ERROR = { error: '검사 문항을 가져오지 못했어요. 잠시 후 다시 시도해주세요.' }
const REPORT_ERROR = {
  error: '결과표를 만들지 못했어요. 커리어넷 쪽 문제일 수 있어요.',
  /** 답변은 기기에 남아 있으니 다시 시도해도 돼요. */
  retryable: true,
}

export async function inspectRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>('/api/inspect/questions', async (request, reply) => {
    const q = Number(request.query.q)

    // 화이트리스트 밖은 커리어넷에 닿기 전에 막아요.
    if (!Number.isInteger(q) || !isAllowedTest(q)) {
      return reply.code(400).send({ error: '허용되지 않은 검사 번호예요.' })
    }

    const cacheKey = `questions:${q}`
    const cached = questionsCache.get(cacheKey)
    if (cached !== undefined) {
      return reply.header('x-cache', 'HIT').send(cached)
    }

    try {
      const data = await fetchQuestions(q)
      questionsCache.set(cacheKey, data)
      return reply.header('x-cache', 'MISS').send(data)
    } catch (error) {
      const reason = error instanceof CareernetError ? error.reason : String(error)
      request.log.error({ q, reason }, 'careernet questions failed')
      return reply.code(502).send(QUESTIONS_ERROR)
    }
  })

  app.post<{ Body: ReportInput }>('/api/inspect/report', async (request, reply) => {
    const body = request.body
    const q = Number(body?.qestrnSeq)

    if (!Number.isInteger(q) || !isAllowedTest(q)) {
      return reply.code(400).send({ error: '허용되지 않은 검사 번호예요.' })
    }

    if (typeof body.answers !== 'string' || body.answers.trim() === '') {
      return reply.code(400).send({ error: '답변이 비어 있어요.' })
    }

    try {
      const data = await createReport(body)
      // 결과 URL은 응답 본문으로만 전달하고 로그에 남기지 않아요. (CLAUDE.md §2.4)
      return reply.send(data)
    } catch (error) {
      const reason = error instanceof CareernetError ? error.reason : String(error)
      request.log.error({ qestrnSeq: body?.qestrnSeq, reason }, 'careernet report failed')
      return reply.code(502).send(REPORT_ERROR)
    }
  })
}
