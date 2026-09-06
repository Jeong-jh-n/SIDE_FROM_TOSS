import { Storage } from '@apps-in-toss/web-framework'

/**
 * 토스 네이티브 저장소 래퍼.
 *
 * ## 왜 localStorage 로는 부족한가
 *
 * `localStorage` 는 **오리진에 묶입니다.** 앱인토스 SDK 를 3.1.1 이상으로 올리면
 * 웹뷰 오리진이 바뀌고, 그 순간 이전 오리진에 저장된 값은 **읽을 방법이 없습니다.**
 * 브라우저 규칙이라 우회가 안 돼요. 지금 저장 키가 22개고 명함·결과지 저장이
 * 얹히는 중이라, 그대로 두면 사용자 데이터가 통째로 사라집니다.
 *
 * 네이티브 저장소는 오리진과 무관해서 이 변경을 넘어갑니다.
 *
 * ## 두 가지 제약
 *
 * 1. **비동기입니다.** 앱 전체가 동기 `loadState` 를 쓰고 있어서, 여기서 직접
 *    화면을 그리게 하지 않아요. `storage.ts` 가 앱 시작 때 한 번 읽어 메모리에
 *    올려두고, 화면은 그 메모리를 동기로 읽습니다.
 * 2. **키 목록 API 가 없습니다.** `getItem`/`setItem`/`removeItem`/`clearItems`
 *    뿐이라, 우리가 인덱스를 직접 관리해요.
 *
 * ## 토스 밖에서는
 *
 * 네이티브 브릿지 호출이라 토스 앱 밖에서는 거부되거나 **응답이 아예 안 옵니다.**
 * 그래서 모든 호출에 타임아웃을 겁니다. 한 번 실패하면 사용 불가로 기억해서
 * 이후 호출은 즉시 건너뛰어요. 브라우저 개발 중에 매번 기다리지 않게요.
 */

/** 브릿지가 응답하지 않을 때 기다릴 시간. 첫 화면을 늦추지 않을 만큼만. */
const TIMEOUT_MS = 1_500

/** `null` = 아직 모름. 한 번 판정하면 그대로 씁니다. */
let available: boolean | null = null

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('native storage timeout')), TIMEOUT_MS),
    ),
  ])
}

/** 네이티브 저장소를 쓸 수 있는 환경인지. 판정 결과를 기억해요. */
export function nativeAvailable(): boolean {
  return available === true
}

/**
 * 값을 읽어요. 못 읽으면 `null`.
 *
 * 첫 호출이 성공하면 이후 호출들은 타임아웃을 다시 겪지 않습니다.
 */
export async function nativeGet(key: string): Promise<string | null> {
  if (available === false) return null
  try {
    const value = await withTimeout(Storage.getItem(key))
    available = true
    return value
  } catch {
    // 토스 밖이거나 브릿지가 죽은 경우. 이후 호출은 건너뜁니다.
    if (available === null) available = false
    return null
  }
}

/**
 * 값을 저장해요. **결과를 기다리지 않습니다.**
 *
 * 화면 쪽 저장은 동기라 여기서 기다릴 수가 없어요. localStorage 에도 같은 값이
 * 들어가 있으니, 이쪽이 늦거나 실패해도 당장 화면이 깨지지는 않습니다.
 */
export function nativeSet(key: string, value: string): void {
  if (available === false) return
  void Storage.setItem(key, value).catch(() => {
    if (available === null) available = false
  })
}

/** 값을 지워요. 저장과 마찬가지로 기다리지 않습니다. */
export function nativeRemove(key: string): void {
  if (available === false) return
  void Storage.removeItem(key).catch(() => {
    if (available === null) available = false
  })
}
