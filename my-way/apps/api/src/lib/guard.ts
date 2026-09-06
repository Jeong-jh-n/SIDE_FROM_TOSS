/**
 * 공개 배포에 필요한 최소 방어.
 *
 * 이 서버는 **AI 자격증명을 들고 있고, 호출마다 토큰 비용이 듭니다.** 배포되면
 * 주소를 아는 누구나 부를 수 있어요. 막아두지 않으면 남이 우리 계정으로 긁어갑니다.
 *
 * 생성 요청이 초 단위로 걸리는 것도 있어서, 빈도 제한은 비용뿐 아니라 응답 시간을
 * 지키는 역할도 해요.
 */

/** 창 하나에 허용할 요청 수. 한 사람이 검사 하나를 푸는 데 충분한 양이에요. */
const LIMIT = Number(process.env.RATE_LIMIT ?? 120)
const WINDOW_MS = Number(process.env.RATE_WINDOW_MS ?? 60_000)

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/**
 * 고정 창 방식. 창이 바뀌면 0부터 다시 셉니다.
 *
 * 인메모리라 **프로세스를 여러 개 띄우면 인스턴스마다 따로 셉니다.** 지금 규모에는
 * 충분하지만, 여러 대로 늘릴 때는 공유 저장소(Redis 등)로 옮겨야 해요.
 */
export function hitRateLimit(key: string, now = Date.now()): boolean {
  const bucket = buckets.get(key)

  if (bucket === undefined || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  bucket.count += 1
  return bucket.count > LIMIT
}

/** 오래된 항목을 치워요. 메모리가 무한정 늘지 않게. */
export function sweepRateLimit(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/**
 * CORS 허용 출처.
 *
 * 개발에서는 비워두고 전부 허용합니다(로컬 포트가 자주 바뀌어요).
 * **배포에서는 반드시 `ALLOWED_ORIGINS` 를 채우세요.** 비워두면 아무 사이트나
 * 우리 서버를 통해 AI 를 부를 수 있습니다.
 */
export function corsOrigin(): true | string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim()
  if (!raw) return true
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}
