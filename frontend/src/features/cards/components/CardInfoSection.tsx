import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { formatDateTime } from '@/shared/lib/dates'
import { formatDuration } from '@/shared/lib/duration'
import type { CardDetail } from '@/shared/types/api'
import { ParamRow } from './CardMainParams'

/**
 * «Сведения» окна карточки: кто и когда создал, начало и завершение работы, время выполнения (lead time) и время
 * в работе (cycle time) — по истории переходов (ADR-0006). Показываются только известные значения.
 */
export function CardInfoSection({ card }: { card: CardDetail }) {
  const { t } = useTranslation('boards')
  const { data: me } = useCurrentUser()
  const date = (value: string) => formatDateTime(value, me?.timezone)

  return (
    <dl className="grid grid-cols-1 gap-2">
      <ParamRow label={t('info.createdBy')}>{card.created_by.name}</ParamRow>
      <ParamRow label={t('info.created')}>{date(card.created_at)}</ParamRow>
      {card.first_started_at && (
        <ParamRow label={t('info.started')}>{date(card.first_started_at)}</ParamRow>
      )}
      {card.completed_at && (
        <ParamRow label={t('info.completed')}>{date(card.completed_at)}</ParamRow>
      )}
      {card.metrics.lead_time_seconds !== null && (
        <ParamRow label={t('info.leadTime')}>
          {formatDuration(card.metrics.lead_time_seconds, t)}
        </ParamRow>
      )}
      {card.metrics.cycle_time_seconds !== null && (
        <ParamRow label={t('info.cycleTime')}>
          {formatDuration(card.metrics.cycle_time_seconds, t)}
        </ParamRow>
      )}
    </dl>
  )
}
