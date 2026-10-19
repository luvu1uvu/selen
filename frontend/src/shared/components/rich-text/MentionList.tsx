import { forwardRef, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import type { MentionCandidate } from './doc'

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

/** Список подсказки @: стрелки — выбор, Enter — вставить, Esc — закрыть (обрабатывает suggestion). */
export const MentionList = forwardRef<
  MentionListHandle,
  { items: MentionCandidate[]; command: (item: { id: string; label: null }) => void }
>(function MentionList({ items, command }, ref) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState(0)
  // Новый список — выделение на первом (паттерн «подстройка состояния при рендере»)
  const [seen, setSeen] = useState(items)
  if (seen !== items) {
    setSeen(items)
    setSelected(0)
  }

  const pick = (index: number) => {
    const item = items[index]
    if (item) command({ id: item.id, label: null })
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === 'ArrowDown') {
        setSelected((selected + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((selected - 1 + items.length) % Math.max(items.length, 1))
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(selected)
        return true
      }
      return false
    },
  }))

  return (
    <div
      role="listbox"
      aria-label={t('richText.mentionList')}
      className="bg-popover text-popover-foreground z-50 max-h-60 min-w-48 overflow-y-auto rounded-md border p-1 shadow-md"
    >
      {items.length === 0 ? (
        <div className="text-muted-foreground px-2 py-1.5 text-sm">{t('richText.noMentions')}</div>
      ) : (
        items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={cn(
              'w-full rounded-sm px-2 py-1.5 text-left text-sm',
              index === selected && 'bg-accent text-accent-foreground',
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              pick(index)
            }}
          >
            {item.name}
          </button>
        ))
      )}
    </div>
  )
})
