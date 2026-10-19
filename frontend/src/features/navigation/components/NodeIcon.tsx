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

/** Пометка пустой папки — в дереве её видит только Владелец (ADR-0017). */
export function EmptyFolderMark() {
  const { t } = useTranslation('spaces')
  return (
    <span title={t('tree.emptyFolderHint')} className="ml-auto shrink-0 text-xs whitespace-nowrap">
      {t('tree.emptyFolder')}
    </span>
  )
}

/** Значок «доступно всем сотрудникам» (группа «Все сотрудники», ADR-0012). */
export function EveryoneMark({ folder = false }: { folder?: boolean }) {
  const { t } = useTranslation('spaces')
  const label = folder ? t('tree.folderEveryone') : t('tree.everyone')
  return (
    <span title={label} className="flex shrink-0">
      <UsersRound aria-hidden className="text-muted-foreground size-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Пометка в «Структуре»: узла нет в дереве текущего пользователя (нет доступа к пространствам или пустая папка —
 * её в дереве видит только Владелец). Чтобы перемещения рядом со скрытыми узлами не сбивали с толку.
 * Подсказка — всплывающая (Tooltip): видна при наведении и при фокусе с клавиатуры; атрибут title этого не
 * умеет (LATER-57).
 */
export function HiddenFromTreeMark() {
  const { t } = useTranslation('admin')
  const label = t('structure.notInTree')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className="focus-visible:ring-ring/50 flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          <EyeOff aria-hidden className="text-muted-foreground/70 size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
