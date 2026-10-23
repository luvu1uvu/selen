import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePersistentState } from '@/shared/lib/usePersistentState'
import { cn } from '@/shared/lib/utils'

/**
 * Секция окна карточки (README Kaiten, раздел 02): заголовок со стрелкой сворачивания, справа — счётчик и действие
 * секции. Свёрнута или развёрнута — запоминается в браузере для всех карточек сразу (по виду секции). `forceOpen` —
 * пункт «+» добавляет в свёрнутую секцию (чек-лист в свёрнутые «Чек-листы»): она раскрывается. Свёрнутая секция
 * прячет содержимое, а не убирает его: начатый в ней текст не пропадает.
 */
export function CardSection({
  id,
  title,
  count,
  action,
  defaultOpen = true,
  forceOpen = false,
  children,
}: {
  /** Вид секции — ключ запомненного состояния. */
  id: string
  title: string
  count?: number
  /** Кнопка справа в заголовке (например, «Изменить описание»). */
  action?: ReactNode
  defaultOpen?: boolean
  forceOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = usePersistentState(`selen.cardWindow.section.${id}`, defaultOpen)
  // Пункт «+» раскрывает свёрнутую секцию один раз — дальше её снова можно свернуть (подстройка состояния при рендере)
  const [forced, setForced] = useState(forceOpen)
  if (forced !== forceOpen) {
    setForced(forceOpen)
    if (forceOpen && !open) setOpen(true)
  }
  const contentId = useId()

  return (
    <section className="grid grid-cols-1 gap-2" aria-label={title}>
      <div className="flex min-h-8 items-center gap-2">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            className="hover:bg-accent focus-visible:ring-ring -ml-1.5 inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-1.5 text-sm font-semibold outline-none focus-visible:ring-[3px]"
            onClick={() => setOpen(!open)}
          >
            <ChevronDown
              aria-hidden
              className={cn(
                'text-muted-foreground size-4 shrink-0 transition-transform',
                !open && '-rotate-90',
              )}
            />
            <span className="truncate">{title}</span>
            {count !== undefined && count > 0 && (
              <>
                {/* Диктору — «Чек-листы, 1», а не «Чек-листы1» */}
                <span className="sr-only">, </span>
                <span className="text-muted-foreground text-xs font-normal tabular-nums">
                  {count}
                </span>
              </>
            )}
          </button>
        </h3>
        {action}
      </div>
      <div id={contentId} hidden={!open} className="grid grid-cols-1 gap-2">
        {children}
      </div>
    </section>
  )
}
