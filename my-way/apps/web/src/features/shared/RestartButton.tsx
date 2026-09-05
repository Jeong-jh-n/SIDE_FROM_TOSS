import { useState } from 'react'
import { ConfirmSheet } from '@/components/ConfirmSheet'

/**
 * 되돌릴 수 없는 초기화라 항상 확인 시트를 거쳐요.
 * 토스 웹뷰에서 `window.confirm`이 막히는 경우가 있어 직접 그린 시트를 씁니다.
 */
interface Props {
  label: string
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  /** 'ghost'는 강조 버튼, 'text'는 화면 하단의 약한 링크 */
  variant?: 'ghost' | 'text'
}

export function RestartButton({
  label,
  title,
  description,
  confirmLabel,
  onConfirm,
  variant = 'ghost',
}: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={variant === 'ghost' ? 'button button--ghost button--block' : 'text-button text-button--weak'}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <ConfirmSheet
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          onConfirm={() => {
            onConfirm()
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  )
}
