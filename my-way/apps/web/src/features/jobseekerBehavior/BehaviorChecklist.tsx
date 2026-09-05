import { useEffect, useState } from 'react'
import { behavior, behaviorItemGroups } from '@/lib/content'
import { loadState, saveState } from '@/lib/storage'
import { TopBar } from '@/features/shared/TopBar'
import { ConfirmSheet } from '@/components/ConfirmSheet'

const STORAGE_KEY = 'track:jobseeker_behavior'

interface Saved {
  checked: string[]
  submitted: boolean
}

const EMPTY: Saved = { checked: [], submitted: false }

/**
 * 트랙 B — 단일 화면 다중선택 체크리스트.
 *
 * 문항을 하나씩 묻지 않아요. 14개를 한 화면에 놓고 한 턴에 끝냅니다. (CLAUDE.md §9)
 * `separate: true`인 F1은 기준 기간이 달라(최근 1개월) 따로 떼어 제시해요.
 */
export function BehaviorChecklist({ onDone }: { onDone: (checked: string[]) => void }) {
  const { main, separate } = behaviorItemGroups()
  const [checked, setChecked] = useState<string[]>(() => loadState(STORAGE_KEY, EMPTY).checked)
  /** 하나도 안 고르고 넘어가려 할 때 한 번 되묻어요. */
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)

  useEffect(() => {
    saveState<Saved>(STORAGE_KEY, { checked, submitted: false })
  }, [checked])

  const toggle = (id: string) => {
    setChecked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  const groupName = (groupId: string) =>
    behavior.groups.find((group) => group.id === groupId)?.name ?? groupId

  // 그룹 순서는 JSON의 groups 순서를 따라요.
  const grouped = behavior.groups
    .map((group) => ({ group, items: main.filter((item) => item.group === group.id) }))
    .filter((entry) => entry.items.length > 0)

  return (
    <div className="page page--checklist">
      <TopBar title={behavior.title} />

      <header className="checklist-header">
        <p className="checklist-prompt">{behavior.format.prompt}</p>
        <p className="checklist-window">기준 기간 · {behavior.format.window}</p>
      </header>

      {grouped.map(({ group, items }) => (
        <section className="card" key={group.id}>
          <h2 className="section-title">{groupName(group.id)}</h2>
          {items.map((item) => (
            <label className="check-row" key={item.id}>
              <input
                type="checkbox"
                checked={checked.includes(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </section>
      ))}

      {separate.map((item) => (
        <section className="card card--separate" key={item.id}>
          <p className="checklist-window">기준 기간 · {item.window}</p>
          <label className="check-row" key={item.id}>
            <input
              type="checkbox"
              checked={checked.includes(item.id)}
              onChange={() => toggle(item.id)}
            />
            <span>{item.text}</span>
          </label>
        </section>
      ))}

      <p className="checklist-count">
        {checked.length > 0 ? `${checked.length}개 골랐어` : '아직 고른 게 없어'}
      </p>

      {/*
        체크가 없어도 넘어갈 수 있어요 — "없으면 없는 대로 괜찮아"가 이 검사의 전제고,
        '시작 전' 단계도 그걸 위해 있는 규칙입니다. 다만 실수로 넘어가는 것과 구분되지 않아
        한 번만 되물어요.
      */}
      <button
        type="button"
        className="button button--primary button--block"
        onClick={() => (checked.length === 0 ? setConfirmingEmpty(true) : onDone(checked))}
      >
        다 골랐어
      </button>

      {confirmingEmpty && (
        <ConfirmSheet
          title="하나도 해당하는 게 없어?"
          description="정말 없어도 괜찮아. 그대로 넘어가면 '시작 전' 단계로 정리해줄게. 빠뜨린 게 있으면 돌아가서 골라도 돼."
          confirmLabel="없어, 넘어갈래"
          onConfirm={() => {
            setConfirmingEmpty(false)
            onDone(checked)
          }}
          onCancel={() => setConfirmingEmpty(false)}
        />
      )}
    </div>
  )
}
