/**
 * 백엔드 HTTP 클라이언트 (골격).
 *
 * 지금은 서버가 없어서 실제 요청을 보내지 않아요.
 * `VITE_API_BASE_URL`이 설정되면 그때부터 실제 서버를 호출하도록 되어 있어요.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const isBackendEnabled = BASE_URL !== ''

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isBackendEnabled) {
    throw new ApiError('backend not configured (VITE_API_BASE_URL empty)', 0)
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // TODO: 토스 로그인 authorizationCode로 발급받은 세션 토큰을 여기에 실어요.
      // Authorization: `Bearer ${getSessionToken()}`,
      ...init?.headers,
    },
  })

  if (!res.ok) {
    throw new ApiError(`request failed: ${path}`, res.status)
  }

  return (await res.json()) as T
}

/** 목업 응답에 약간의 지연을 줘서 로딩 UI를 확인할 수 있게 해요. */
export function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
