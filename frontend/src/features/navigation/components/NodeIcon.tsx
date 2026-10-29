import type { CSSProperties, MouseEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { Boxes, EyeOff, Folder, SquareKanban, UsersRound } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const FALLBACK = { folder: Folder, space: Boxes, board: SquareKanban }

/** Иконка узла дерева: эмодзи, заданная системным администратором, иначе стандартная. */
export function NodeIcon({
  kind,
  icon,
  className,
}: {
  kind: 'folder' | 'space' | 'board'
  icon?: string | null
  className?: string
}) {
  if (icon) {
    return (
      <span
        aria-hidden
        className={cn('flex size-4 shrink-0 items-center justify-center', className)}
      >
        {icon}
      </span>
    )
  }
  const Icon = FALLBACK[kind]
  return <Icon aria-hidden className={cn('text-muted-foreground size-4 shrink-0', className)} />
}

const markShape = 'rounded-sm'

/**
 * Пометка «пустая» пустой папки — в дереве её видят Владелец (ADR-0017) и тот, кому выдан доступ к ней (П2d-1). Почему
 * пустая — в подсказке Tooltip по наведению и по фокусу (LATER-88): пометка получает фокус, поэтому в дереве она стоит
 * рядом с кнопкой папки, а не внутри неё (`NavTree`); `className`, `style` — её место там.
 */
export function EmptyFolderMark({
  className,
  style,
  onClick,
}: {
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLElement>
}) {
  const { t } = useTranslation('spaces')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn('text-muted-foreground text-xs whitespace-nowrap', markShape, className)}
          style={style}
          onClick={onClick}
        >
          {t('tree.emptyFolder')}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t('tree.emptyFolderHint')}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Значок «доступно всем сотрудникам» (группа «Все сотрудники», ADR-0012). Подсказка — Tooltip по наведению и по фокусу
 * (LATER-88, как `HiddenFromTreeMark`); в дереве значок стоит поверх строки, рядом со ссылкой (`NavTree`).
 */
export function EveryoneMark({
  folder = false,
  className,
  style,
  onClick,
}: {
  folder?: boolean
  className?: string
  style?: CSSProperties
  /** В дереве — щелчок как по строке (значок лежит поверх неё). */
  onClick?: MouseEventHandler<HTMLElement>
}) {
  const { t } = useTranslation('spaces')
  const label = folder ? t('tree.folderEveryone') : t('tree.everyone')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className={cn('flex shrink-0', markShape, className)}
          style={style}
          onClick={onClick}
        >
          <UsersRound aria-hidden className="text-muted-foreground size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Пометка в «Структуре»: узла нет в дереве текущего пользователя (нет доступа к пространствам или пустая папка —
 * её в дереве видят Владелец и тот, кому выдан доступ к ней). Чтобы перемещения рядом со скрытыми узлами не сбивали с толку.
 * Подсказка — всплывающая (Tooltip): видна при наведении и при фокусе с клавиатуры; атрибут title этого не
 * умеет (LATER-57).
 */
export function HiddenFromTreeMark() {
  const { t } = useTranslation('admin')
  const label = t('structure.notInTree')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={label} tabIndex={0} className={cn('flex shrink-0', markShape)}>
          <EyeOff aria-hidden className="text-muted-foreground/70 size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
