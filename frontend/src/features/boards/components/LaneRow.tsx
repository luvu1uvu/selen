import type { MouseEvent, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { TruncatedText } from '@/shared/components/TruncatedText'
import { cn } from '@/shared/lib/utils'
import type { Lane } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import type { StructureAction } from './StructureDialogs'
import { LaneMenu } from './StructureMenus'

/**
 * Строка дорожки во всю ширину доски (как в Kaiten, docs/ui-reference/kaiten/README.md, раздел 03): слева название
 * и меню администратора, справа счётчик карточек дорожки и шеврон «свернуть / развернуть». Обе части закреплены
 * (sticky) — при прокрутке доски вбок остаются на экране. Свёрнутая дорожка — одна эта строка, ячеек нет; щелчок
 * по строке её разворачивает (ответ PM 19.10). Сворачивание личное (ADR-0019).
 */
export function LaneRow({
  lane,
  lanes,
  count,
  collapsed,
  canManage,
  rowRef,
  className,
  onAction,
  onToggle,
}: {
  lane: Lane
  lanes: Lane[]
  /** Карточек дорожки, видимых пользователю. */
  count: number
  collapsed: boolean
  canManage: boolean
  /** Строка свёрнутой дорожки: над ней перетаскиваемая карточка не находит цели (useBoardDnd). */
  rowRef?: Ref<HTMLDivElement>
  className?: string
  onAction: (action: StructureAction) => void
  onToggle: () => void
}) {
  const { t } = useTranslation('boards')
  const label = t(collapsed ? 'lane.expand' : 'lane.collapse', { name: lane.name })

  // Щелчок по свёрнутой строке — развернуть; щелчки по её кнопкам и по меню (оно в портале, но событие React
  // всплывает и оттуда) — нет
  const expandOnClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element
    if (event.currentTarget.contains(target) && !target.closest('button')) onToggle()
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        // Полоса во всю ширину блока, со своим лёгким фоном: линии колонок через неё не идут. Фон непрозрачный
        // (muted 40 % поверх фона доски), его наследуют закреплённые части: на узкой видимой части доски счётчик
        // и шеврон закрывают конец названия, а не ложатся поверх текста
        'flex h-10 items-center justify-between gap-2 bg-[color-mix(in_oklab,var(--color-muted)_40%,var(--color-background))] px-3',
        collapsed && 'hover:bg-muted cursor-pointer',
        className,
      )}
      onClick={collapsed ? expandOnClick : undefined}
      data-lane-row={collapsed ? 'collapsed' : 'expanded'}
    >
      <div className="sticky left-3 flex max-w-96 min-w-0 items-center gap-1 bg-inherit">
        <TruncatedText text={lane.name} className="text-sm font-semibold" />
        {canManage && <LaneMenu lane={lane} lanes={lanes} onAction={onAction} />}
      </div>
      <div className="sticky right-3 flex shrink-0 items-center gap-1 bg-inherit pl-2">
        <span className="text-muted-foreground text-xs tabular-nums" aria-hidden>
          {count}
        </span>
        <span className="sr-only">{t('lane.cardsCount', { count })}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={label}
              aria-expanded={!collapsed}
              // Щелчок мышью не переводит фокус на стрелку: рамка фокуса — только с клавиатуры (Tab, замечание PM),
              // а фокус мышью на кнопке, прилипшей к правому краю, прокручивал доску вбок к её месту в конце строки
              onMouseDown={(event) => event.preventDefault()}
              onClick={onToggle}
            >
              {collapsed ? <ChevronDown /> : <ChevronUp />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
