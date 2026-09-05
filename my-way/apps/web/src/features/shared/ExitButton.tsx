import { Screen } from '@apps-in-toss/web-framework'

/**
 * 미니앱 나가기.
 *
 * > **지금은 화면에 붙어 있지 않습니다.** 상단 바 오른쪽이 "첫화면으로" 로 바뀌면서
 * > 빠졌어요. 토스 앱은 자체 뒤로가기가 있어 없어도 나갈 수 있습니다.
 * > 다시 필요하면 `TopBar` 에 붙이면 돼요.
 *
 * 토스 앱 안에서는 `Screen.close()`로 화면을 닫아요. 브라우저 개발 환경처럼
 * 닫을 수 없는 곳에서는 아무 일도 일어나지 않으므로, 그때는 홈으로 보냅니다.
 *
 * 진행 상태는 문항마다 localStorage에 저장돼 있어서, 나갔다 들어와도 이어서 할 수 있어요.
 * 그래서 확인 시트를 두지 않았습니다.
 */
export function ExitButton({ onFallback }: { onFallback?: () => void }) {
  const handleExit = async () => {
    try {
      await Screen.close()
    } catch {
      // 토스 앱이 아니면 닫을 수 없어요.
      onFallback?.()
    }
  }

  return (
    <button
      type="button"
      className="icon-button icon-button--exit"
      onClick={() => void handleExit()}
      aria-label="나가기"
      title="나가기"
    >
      ✕
    </button>
  )
}
