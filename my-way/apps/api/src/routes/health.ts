import type { FastifyInstance } from 'fastify'

/**
 * 서버가 떠 있는지만 봐요.
 *
 * 예전에는 커리어넷 인증키의 만료 잔여일을 함께 돌려줬습니다. 커리어넷 연동을
 * 걷어내면서 그 부분이 없어졌어요. 되살릴 일이 생기면 `CAREERNET.md` §7 을 보세요 —
 * 유효기간 2년, 60일 미만이면 경고 레벨이라는 규칙이 적혀 있습니다.
 *
 * AI 쪽 상태는 `/api/ai/health` 가 따로 돌려줘요. 어느 제공자로 붙어 있는지와
 * 리전이 거기 나옵니다. **배포 후 한 번 확인하세요.**
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_request, reply) => {
    return reply.send({ status: 'up' })
  })
}
