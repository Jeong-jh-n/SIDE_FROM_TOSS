import type { FastifyInstance } from 'fastify'
import { keyExpiry } from '../lib/careernet.js'

/** 60일 미만이면 경고 레벨로 응답해요. (CLAUDE.md §4) */
const WARN_DAYS = 60

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_request, reply) => {
    const { expiresAt, daysLeft } = keyExpiry(new Date())
    const hasKey = Boolean(process.env.CAREERNET_API_KEY)

    const level =
      !hasKey || daysLeft === null
        ? 'unknown'
        : daysLeft < 0
          ? 'expired'
          : daysLeft < WARN_DAYS
            ? 'warning'
            : 'ok'

    return reply.send({
      status: level === 'expired' ? 'down' : 'up',
      key: {
        configured: hasKey,
        expiresAt,
        daysLeft,
        level,
      },
    })
  })
}
