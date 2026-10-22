import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { formatDateTime, formatRelative } from '@/shared/lib/dates'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

/**
 * Относительное время («3 дня назад»), точное — в подсказке по наведению и по фокусу (правила вида, раздел 9). `text` —
 * подпись вокруг времени («Создана 3 дня назад»), `hint` — подсказка вокруг точной даты («…, автор»).
 */
export function TimeAgo({
  at,
  text = (time) => time,
  hint = (date) => date,
}: {
  at: string
  text?: (time: string) => string
  hint?: (date: string) => string
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
          className="focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-[3px]"
        >
          {text(formatRelative(at) ?? t('card.justNow'))}
        </time>
      </TooltipTrigger>
      <TooltipContent>{exact}</TooltipContent>
    </Tooltip>
  )
}
