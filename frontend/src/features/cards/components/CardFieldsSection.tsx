import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { DueBadge } from '@/shared/components/DueBadge'
import { isoToZoned, zonedToIso } from '@/shared/lib/due'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import type { CardUpdate } from '../api'
import { useUpdateCard } from '../queries'

/** Значения полей ввода срока в часовом поясе пользователя. */
function dueInputs(card: CardDetail, timeZone?: string): { date: string; time: string } {
  if (card.due_at) return isoToZoned(card.due_at, timeZone)
  return { date: card.due_date ?? '', time: '' }
}

/**
 * Срок (дата и необязательное время), «Срочно» и оценка трудозатрат в часах (шаг 0,5).
 * Время вводится в часовом поясе из профиля, на сервер уходит в UTC.
 */
export function CardFieldsSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const timeZone = me?.timezone
  const update = useUpdateCard(card.key)
  const [due, setDue] = useState(() => dueInputs(card, timeZone))
  const [estimate, setEstimate] = useState(card.estimate_hours?.toString() ?? '')
  const [estimateError, setEstimateError] = useState<string | null>(null)

  // Карточка изменилась на сервере — подтягиваем поля (паттерн «подстройка состояния при рендере»)
  const serverKey = `${card.due_date}|${card.due_at}|${card.estimate_hours}|${timeZone}`
  const [synced, setSynced] = useState(serverKey)
  if (synced !== serverKey) {
    setSynced(serverKey)
    setDue(dueInputs(card, timeZone))
    setEstimate(card.estimate_hours?.toString() ?? '')
  }

  const save = async (payload: CardUpdate) => {
    try {
      await update.mutateAsync(payload)
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const saveDue = (date: string, time: string) => {
    setDue({ date, time })
    if (!date) return save({ due_date: null, due_at: null })
    return time
      ? save({ due_at: zonedToIso(date, time, timeZone) })
      : save({ due_date: date, due_at: null })
  }

  const saveEstimate = () => {
    const value = estimate.trim().replace(',', '.')
    const hours = value === '' ? null : Number(value)
    if (hours !== null && (Number.isNaN(hours) || hours < 0 || (hours * 2) % 1 !== 0)) {
      setEstimateError(t('fields.estimateInvalid'))
      return
    }
    setEstimateError(null)
    if (hours !== card.estimate_hours) void save({ estimate_hours: hours })
  }

  const hasDue = card.due_date !== null || card.due_at !== null

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <span className="text-muted-foreground flex items-center gap-2 text-xs">
          {t('fields.due')}
          {hasDue && <DueBadge card={card} now={new Date()} timeZone={timeZone} />}
        </span>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label={t('fields.dueDate')}
              className="w-40"
              value={due.date}
              disabled={update.isPending}
              onChange={(event) =>
                void saveDue(event.target.value, event.target.value ? due.time : '')
              }
            />
            <Input
              type="time"
              aria-label={t('fields.dueTime')}
              className="w-28"
              value={due.time}
              disabled={update.isPending || !due.date}
              onChange={(event) => setDue({ ...due, time: event.target.value })}
              onBlur={() =>
                due.date &&
                due.time !== dueInputs(card, timeZone).time &&
                saveDue(due.date, due.time)
              }
            />
            {hasDue && (
              <Button variant="ghost" size="sm" onClick={() => saveDue('', '')}>
                {t('fields.clearDue')}
              </Button>
            )}
          </div>
        ) : (
          !hasDue && <span className="text-muted-foreground text-sm">{t('fields.noDue')}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="card-urgent"
          checked={card.is_urgent}
          disabled={!canEdit || update.isPending}
          onCheckedChange={(checked) => save({ is_urgent: checked === true })}
        />
        <Label htmlFor="card-urgent">{t('fields.urgent')}</Label>
      </div>

      <FormField id="card-estimate" label={t('fields.estimate')} error={estimateError ?? undefined}>
        <Input
          id="card-estimate"
          inputMode="decimal"
          className="w-32"
          value={estimate}
          disabled={!canEdit}
          placeholder={canEdit ? t('fields.estimatePlaceholder') : '—'}
          aria-invalid={!!estimateError}
          onChange={(event) => setEstimate(event.target.value)}
          onBlur={saveEstimate}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </FormField>
    </div>
  )
}
