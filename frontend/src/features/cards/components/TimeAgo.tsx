import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import { useCurrentUser } from '@/features/auth/queries'
import { formatDateTime, formatRelative } from '@/shared/lib/dates'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/**
 * Относительное время («3 дня назад»), точное — в подсказке по наведению и по фокусу (правила вида, раздел 9). `text` —
 * подпись вокруг времени («Создана 3 дня назад»), `hint` — подсказка вокруг точной даты («… · создал(а) автор»),
 * `icon` — значок перед подписью (серая строка шапки окна карточки, V-3 UX-ревью UI-1a).
 */
export function TimeAgo({
  at,
  text = (time) => time,
  hint = (date) => date,
  icon: Icon,
}: {
  at: string
  text?: (time: string) => string
  hint?: (date: string) => string
  icon?: LucideIcon
}) {
  const { t } = useTranslation('boards')
  const { data: me } = useCurrentUser()
  const exact = hint(formatDateTime(at, me?.timezone))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={at}
          tabIndex={0}
          aria-description={exact}
          className="focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {Icon && <Icon aria-hidden className="size-3 shrink-0" />}
          {text(formatRelative(at) ?? t('card.justNow'))}
        </time>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  )
}
