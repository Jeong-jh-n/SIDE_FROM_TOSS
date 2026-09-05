import { TossAuth, saveBase64Data } from '@apps-in-toss/web-framework'
import type { TossProfile } from '../types'

/**
 * 토스 플랫폼 연동 래퍼.
 *
 * 2번 기능에서 이름·휴대폰·생년월일·성별·국적·이메일은 사용자가 직접 입력하지 않고
 * 토스 로그인에서 가져와요. 다만 `TossAuth.login()`이 돌려주는 건 `authorizationCode`뿐이고,
 * 실제 사용자 정보는 이 코드를 **서버가** 토스에 교환해야 받을 수 있어요.
 * 서버가 아직 없어서 프로필 조회부는 주석으로 남겨두고 null을 반환해요.
 */

export interface TossLoginResult {
  authorizationCode: string
  referrer: 'DEFAULT' | 'SANDBOX'
}

/** 토스 로그인. 미니앱 환경이 아니면 null을 반환해요. */
export async function loginWithToss(): Promise<TossLoginResult | null> {
  try {
    const res = await TossAuth.login()
    return { authorizationCode: res.authorizationCode, referrer: res.referrer }
  } catch {
    // 브라우저 개발 환경 등 토스 앱이 아닌 곳에서는 실패해요.
    return null
  }
}

/**
 * 토스 로그인 사용자 프로필.
 *
 * TODO(backend): authorizationCode를 서버로 넘겨 토스와 교환한 뒤
 *   이름/휴대폰/생년월일/성별/국적/이메일을 받아와요.
 *
 *   const res = await request<TossProfile>('/api/auth/toss', {
 *     method: 'POST',
 *     body: JSON.stringify({ authorizationCode, referrer }),
 *   })
 *   return res
 *
 * 콘솔에서 토스 로그인 연동과 동의 항목 설정이 끝나야 값이 채워져요.
 */
export async function fetchTossProfile(login: TossLoginResult): Promise<TossProfile | null> {
  if (login.authorizationCode === '') return null

  // 서버 연동 전까지는 프로필을 채울 방법이 없어서 null을 돌려줘요.
  return null
}

/** 생년월일(YYYYMMDD 또는 YYYY-MM-DD)에서 만 나이를 계산해요. */
export function toAge(birthday: string | undefined, today: Date): number | null {
  if (!birthday) return null

  const digits = birthday.replace(/\D/g, '')
  if (digits.length !== 8) return null

  const year = Number(digits.slice(0, 4))
  const month = Number(digits.slice(4, 6))
  const day = Number(digits.slice(6, 8))

  let age = today.getFullYear() - year
  const hadBirthday =
    today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!hadBirthday) age -= 1

  return age >= 0 ? age : null
}

/**
 * PNG를 기기에 저장해요.
 * 토스 앱에서는 네이티브 저장을, 그 외 환경에서는 브라우저 다운로드를 사용해요.
 */
export async function saveImage(dataUrl: string, fileName: string): Promise<'native' | 'browser'> {
  const base64 = dataUrl.split(',')[1] ?? ''

  if (saveBase64Data.isSupported()) {
    await saveBase64Data({ data: base64, fileName, mimeType: 'image/png' })
    return 'native'
  }

  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  return 'browser'
}
