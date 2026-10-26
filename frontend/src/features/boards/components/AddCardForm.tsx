import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateCard } from '@/features/cards/queries'
import { getErrorMessage } from '@/shared/api/errors'
import type { Lane } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { useReturnFocusOnClose } from '@/shared/ui/restore-focus'
import { Textarea } from '@/shared/ui/textarea'

/**
 * Форма новой карточки в ячейке: Enter или «Создать» — создать (форма остаётся открытой для следующей),
 * Esc или «Отмена» — закрыть, и фокус вернётся на кнопку, которая открыла форму («+» колонки или «+ Карточка» ячейки,
 * LATER-107); ушли из пустой формы сами — фокус не трогаем. Кнопки — внутри области названия (LATER-42).
 *
 * place — куда встаёт карточка: «end» — в конец ячейки (кнопка под последней карточкой), «start» — в начало
 * (кнопка «+» в заголовке колонки, LATER-44). Если дорожек несколько, форма «в начало» даёт выбрать дорожку.
 *
 * Отступы слева и справа у всех элементов формы — 12 px, как у поля названия (LATER-49). Выбор дорожки:
 * видимая подпись с многоточием и своя стрелка на 12 px от края, а под ними — прозрачный нативный select
 * (клавиатура, скринридер, системный список на телефоне); форма не шире своей колонки.
 */
export function AddCardForm({
  boardId,
  columnId,
  columnName,
  laneId: initialLaneId,
  lanes,
  place,
  cellCardIds,
  label,
  onClose,
}: {
  boardId: string
  columnId: string
  columnName: string
  laneId: string
  /** Дорожки доски — выбор дорожки в форме (только если их больше одной). */
  lanes?: Lane[]
  place: 'start' | 'end'
  /** Карточки ячейки этой колонки и дорожки — соседи новой карточки. */
  cellCardIds: (laneId: string) => string[]
  /** Подпись поля названия. */
  label: string
  onClose: () => void
}) {
  const { t } = useTranslation('boards')
  const [title, setTitle] = useState('')
  const [laneId, setLaneId] = useState(initialLaneId)
  const createCard = useCreateCard(boardId)
  // Esc и «Отмена» — фокус на кнопку, которая открыла форму (её «+ Карточка», пока форма открыта, скрыта)
  const returnFocus = useReturnFocusOnClose()

  const close = () => {
    setTitle('')
    returnFocus()
    onClose()
  }

  // Нажатие на кнопку не уводит фокус из поля: после «Создать» можно сразу вводить следующую карточку
  const keepFocus = (event: React.MouseEvent) => event.preventDefault()

  const submit = async () => {
    const value = title.trim()
    if (!value) return
    const ids = cellCardIds(laneId)
    try {
      await createCard.mutateAsync({
        title: value,
        column_id: columnId,
        lane_id: laneId,
        ...(place === 'end' ? { after_id: ids.at(-1) ?? null } : { before_id: ids[0] ?? null }),
      })
      setTitle('')
    } catch (error) {
      toast.error(getErrorMessage(error, t('addCard.failed')))
    }
  }

  return (
    <div
      className="border-input bg-card focus-within:border-ring focus-within:ring-ring min-w-0 overflow-hidden rounded-md border shadow-xs focus-within:ring-2 dark:shadow-none"
      // Закрываем, только если фокус ушёл за пределы формы (не на её кнопки), а название пустое
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !title.trim()) onClose()
      }}
    >
      {lanes && lanes.length > 1 && (
        // Фокус с клавиатуры на выборе дорожки — своя рамка внутри формы: у всей формы она одна и та же и для поля, и
        // для выбора, а один фон muted/60 — 1,05:1 к белому (U-3 UX-ревью LATER-91)
        <div className="has-[:focus-visible]:bg-muted/60 has-[:focus-visible]:ring-ring relative flex h-8 min-w-0 items-center border-b px-3 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset">
          <span className="min-w-0 flex-1 truncate pr-6" data-slot="lane-value" aria-hidden>
            {lanes.find((lane) => lane.id === laneId)?.name}
          </span>
          <ChevronDown
            className="text-muted-foreground pointer-events-none absolute right-3 size-4"
            data-slot="lane-chevron"
            aria-hidden
          />
          <select
            aria-label={t('addCard.lane')}
            value={laneId}
            onChange={(event) => setLaneId(event.target.value)}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          >
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Textarea
        autoFocus
        rows={2}
        aria-label={label}
        placeholder={t('addCard.placeholder')}
        value={title}
        className="resize-none border-0 shadow-none focus-visible:ring-0"
        // readOnly, а не disabled: поле не теряет фокус, можно сразу вводить следующую карточку
        readOnly={createCard.isPending}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
          if (event.key === 'Escape') close()
        }}
      />
      <div className="flex justify-end gap-2 px-3 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t('addCard.cancelLabel', { column: columnName })}
          onMouseDown={keepFocus}
          onClick={close}
        >
          {t('addCard.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          aria-label={t('addCard.createLabel', { column: columnName })}
          disabled={!title.trim() || createCard.isPending}
          onMouseDown={keepFocus}
          onClick={() => void submit()}
        >
          {t('addCard.create')}
        </Button>
      </div>
    </div>
  )
}
