interface Props {
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 확인용 바텀시트.
 * 토스 웹뷰에서 window.confirm이 막히는 경우가 있어 직접 그려요.
 */
export function ConfirmSheet({ title, description, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="sheet-dim" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <h2 className="sheet-title">{title}</h2>
        <p className="sheet-desc">{description}</p>
        <div className="sheet-actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            취소
          </button>
          <button type="button" className="button button--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
