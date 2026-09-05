import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { inspectRoutes } from './routes/inspect.js'
import { healthRoutes } from './routes/health.js'
import { aiRoutes } from './routes/ai.js'
import { corsOrigin, hitRateLimit, sweepRateLimit } from './lib/guard.js'

// apps/api/.env 를 읽어요. 배포 환경에서는 파일 없이 실제 환경변수를 쓰므로,
// 파일이 없어도 조용히 넘어갑니다. 값은 이 프로세스 안에만 존재해요. (CLAUDE.md §2.1)
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch {
  // .env 가 없으면 무시해요.
}

const PORT = Number(process.env.PORT ?? 3000)

const app = Fastify({
  logger: {
    // 자유 서술과 결과 URL이 로그에 흘러들지 않게 본문은 기록하지 않아요. (CLAUDE.md §2.4, §2.8)
    redact: ['req.headers.authorization', 'req.body', 'res.body'],
  },
})

await app.register(cors, { origin: corsOrigin() })

/*
 * 요청 빈도 제한. 이 서버가 커리어넷 키를 들고 있어서, 배포되면 남이 우리 키로
 * 긁어갈 수 있어요. 화이트리스트가 "무엇을" 막는다면 이건 "얼마나 자주" 를 막습니다.
 */
app.addHook('onRequest', async (request, reply) => {
  // 헬스체크는 모니터링이 자주 부르니 제외해요.
  if (request.url.startsWith('/api/health')) return

  const who = request.ip ?? 'unknown'
  if (hitRateLimit(who)) {
    return reply.code(429).send({ error: '요청이 너무 많아요. 잠시 후 다시 시도해주세요.' })
  }
})

// 오래된 카운터를 주기적으로 치워요. 프로세스가 종료를 막지 않게 unref 합니다.
setInterval(() => sweepRateLimit(), 60_000).unref()
await app.register(healthRoutes)
await app.register(inspectRoutes)
await app.register(aiRoutes)

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
