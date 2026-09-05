/**
 * 화면 제목과 진행 표시.
 *
 * ## 뒤로가기·홈 버튼이 없습니다
 *
 * 예전에는 왼쪽에 `‹`, 오른쪽에 "첫화면으로" 를 뒀는데 **앱인토스 체크리스트가
 * 막습니다.**
 *
 * > "앱인토스 네비게이션 바를 사용하고 있어요."
 * > "토스 네비게이션 바의 뒤로가기 버튼과 미니앱에서 자체 구현한 뒤로가기 버튼이
 * >  동시에 보이지 않아요."
 *
 * 뒤로가기·홈은 **토스 네비게이션 바가 담당**해요(`apps-in-toss.config.ts` 의
 * `navigationBar`). 여기서는 화면 맥락(제목·진행률)만 보여줍니다.
 *
 * 진행 상태는 문항마다 저장되니 어디로 나가도 이어서 할 수 있어요.
 */
interface Props {
  title: string
  /** 진행 표시 (예: 3 / 24). 없으면 표시하지 않아요. */
  current?: number
  total?: number
}

export function TopBar({ title, current, total }: Props) {
  const showProgress = current !== undefined && total !== undefined

  // 보여줄 게 없으면 자리를 차지하지 않아요.
  if (title === '' && !showProgress) return null

  return (
    <header className="top-bar">
      <div className="top-bar-title">
        <strong>{title}</strong>
        {showProgress && (
          <span>
            {current} / {total}
          </span>
        )}
      </div>
    </header>
  )
}
