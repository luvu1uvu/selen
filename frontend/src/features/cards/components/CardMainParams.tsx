import { useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { api } from '@/shared/api/client'
import { getErrorMessage } from '@/shared/api/errors'
import { DueBadge } from '@/shared/components/DueBadge'
import { isoToZoned, zonedToIso } from '@/shared/lib/due'
import { readableTextOn } from '@/shared/lib/palette'
import type { CardDetail, CardPerson, CardType, Collection } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { CommandItem } from '@/shared/ui/command'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import type { CardUpdate } from '../api'
import { focusCardWindow } from '../cardWindow'
import { useCardParticipant, useUpdateCard } from '../queries'
import { CardLabelsField } from './CardLabelsField'
import { PersonLine, PersonPicker } from './PersonPicker'

function useActiveCardTypes(enabled: boolean) {
  return useQuery({
    queryKey: ['card-types'],
    queryFn: async () => (await api.get<Collection<CardType>>('/card-types')).data.data,
    enabled,
  })
}

/** Сохранить поля карточки с уведомлением «Сохранено» или текстом ошибки. */
function useSave(cardKey: string) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const update = useUpdateCard(cardKey)
  const save = async (payload: CardUpdate) => {
    try {
      await update.mutateAsync(payload)
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }
  return { save, pending: update.isPending }
}

/** Строка «название поля — значение»; на узком экране название над значением. */
export function ParamRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start sm:gap-4">
      <dt className="text-muted-foreground text-sm sm:py-1.5">{label}</dt>
      <dd className="flex min-h-8 min-w-0 flex-wrap items-center gap-1.5 text-sm">{children}</dd>
    </div>
  )
}

/** Чип типа карточки: кружок цвета типа с первой буквой названия и название (README Kaiten, раздел 02). */
export function TypeChip({ type }: { type: Pick<CardType, 'name' | 'color'> }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase"
        style={{ backgroundColor: type.color, color: readableTextOn(type.color) }}
      >
        {type.name.charAt(0)}
      </span>
      <span className="truncate">{type.name}</span>
    </span>
  )
}

/** Человек чипом: мелкий аватар, имя и пометки. */
function PersonChip({ person }: { person: CardPerson }) {
  return <PersonLine person={person} compact />
}

/**
 * «Основные параметры» окна карточки (README Kaiten, раздел 02): расположение, тип, ответственный, участники, срок,
 * «Срочно», метки, план в часах. Заказчик — в строке под названием. Пользовательские поля пространства (этап 5) —
 * строками в конце этого списка.
 */
export function CardMainParams({
  card,
  canEdit,
  onMove,
}: {
  card: CardDetail
  canEdit: boolean
  /** Открыть окно переноса (лупа у «Расположения»). */
  onMove: () => void
}) {
  const { t } = useTranslation('boards')
  const column = card.column.parent_name
    ? `${card.column.parent_name} / ${card.column.name}`
    : card.column.name

  return (
    <dl className="grid gap-2">
      <ParamRow label={t('params.location')}>
        <span className="min-w-0 break-words">
          {card.board.name} / {column} ({card.lane.name})
        </span>
        <Badge variant="secondary">{t(`categories.${card.column.category}`)}</Badge>
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={t('card.move')}
                onClick={onMove}
              >
                <Search />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('card.move')}</TooltipContent>
          </Tooltip>
        )}
      </ParamRow>
      <ParamRow label={t('params.type')}>
        <TypeField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow label={t('params.responsible')}>
        <ResponsibleField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow label={t('params.participants')}>
        <ParticipantsField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow label={t('params.due')}>
        <DueField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow label={<Label htmlFor="card-urgent">{t('params.urgent')}</Label>}>
        <UrgentField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow label={t('params.labels')}>
        <CardLabelsField card={card} canEdit={canEdit} />
      </ParamRow>
      <ParamRow
        label={
          canEdit ? (
            <Label htmlFor="card-estimate">{t('params.estimate')}</Label>
          ) : (
            t('params.estimate')
          )
        }
      >
        <EstimateField card={card} canEdit={canEdit} />
      </ParamRow>
    </dl>
  )
}

function TypeField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const types = useActiveCardTypes(canEdit)
  const { save, pending } = useSave(card.key)
  if (!canEdit) return <TypeChip type={card.card_type} />

  // Текущий тип — в списке, даже если его уже архивировали
  const options = (types.data ?? []).some((type) => type.id === card.card_type.id)
    ? (types.data ?? [])
    : [card.card_type, ...(types.data ?? [])]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 max-w-full px-2"
          disabled={pending}
          aria-label={t('params.typeButton', { name: card.card_type.name })}
        >
          <TypeChip type={card.card_type} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((type) => (
          <DropdownMenuCheckboxItem
            key={type.id}
            checked={type.id === card.card_type.id}
            onCheckedChange={() =>
              type.id !== card.card_type.id && void save({ card_type_id: type.id })
            }
          >
            <TypeChip type={type} />
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ResponsibleField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { save, pending } = useSave(card.key)
  const responsible = card.responsible
  if (!canEdit) {
    return responsible ? (
      <PersonChip person={responsible} />
    ) : (
      <span className="text-muted-foreground">{t('people.notAssigned')}</span>
    )
  }
  return (
    <PersonPicker
      spaceKey={card.space.key}
      label={t('params.chooseResponsible')}
      selected={responsible ? [responsible.id] : []}
      current={responsible ? [responsible] : []}
      disabled={pending}
      onSelect={(user) => user.id !== responsible?.id && void save({ responsible_id: user.id })}
      extra={
        responsible
          ? (close) => (
              <UnassignItem
                onSelect={() => {
                  close()
                  void save({ responsible_id: null })
                }}
              />
            )
          : undefined
      }
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-auto min-h-8 max-w-full px-2"
        aria-label={
          responsible ? t('params.responsibleButton', { name: responsible.name }) : undefined
        }
      >
        {responsible ? (
          <PersonChip person={responsible} />
        ) : (
          <span className="text-muted-foreground">{t('params.assign')}</span>
        )}
      </Button>
    </PersonPicker>
  )
}

function UnassignItem({ onSelect }: { onSelect: () => void }) {
  const { t } = useTranslation('boards')
  return (
    <CommandItem value="unassign" keywords={[t('params.unassign')]} onSelect={onSelect}>
      <X aria-hidden />
      {t('params.unassign')}
    </CommandItem>
  )
}

function ParticipantsField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const participant = useCardParticipant(card.key)
  const ids = card.participants.map((person) => person.id)

  const toggle = async (userId: string, add: boolean) => {
    try {
      await participant.mutateAsync({ userId, add })
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <>
      {card.participants.length === 0 && !canEdit && (
        <span className="text-muted-foreground">{t('people.none')}</span>
      )}
      {card.participants.map((person) => (
        <span
          key={person.id}
          className="bg-secondary inline-flex min-w-0 items-center gap-1 rounded-md py-0.5 pr-0.5 pl-1.5"
        >
          <PersonChip person={person} />
          {canEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label={t('people.remove', { name: person.name })}
                  disabled={participant.isPending}
                  onClick={() => void toggle(person.id, false)}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('people.remove', { name: person.name })}</TooltipContent>
            </Tooltip>
          )}
        </span>
      ))}
      {canEdit && (
        <PersonPicker
          spaceKey={card.space.key}
          label={t('params.addParticipants')}
          selected={ids}
          current={card.participants}
          multiple
          disabled={participant.isPending}
          onSelect={(user) => void toggle(user.id, !ids.includes(user.id))}
        >
          <Button variant="ghost" size="sm" className="text-muted-foreground -ml-1 px-2">
            {t('params.addParticipants')}
          </Button>
        </PersonPicker>
      )}
    </>
  )
}

/** Значения полей ввода срока в часовом поясе пользователя. */
function dueInputs(card: CardDetail, timeZone?: string): { date: string; time: string } {
  if (card.due_at) return isoToZoned(card.due_at, timeZone)
  return { date: card.due_date ?? '', time: '' }
}

/**
 * Срок: дата и необязательное время. Время вводится в часовом поясе из профиля, на сервер уходит в UTC.
 * Значение — бейдж срока, как на фасаде; у редактора щелчок открывает поля даты и времени.
 */
function DueField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { data: me } = useCurrentUser()
  const timeZone = me?.timezone
  const { save, pending } = useSave(card.key)
  const [due, setDue] = useState(() => dueInputs(card, timeZone))

  // Карточка изменилась на сервере — подтягиваем поля (паттерн «подстройка состояния при рендере»)
  const serverKey = `${card.due_date}|${card.due_at}|${timeZone}`
  const [synced, setSynced] = useState(serverKey)
  if (synced !== serverKey) {
    setSynced(serverKey)
    setDue(dueInputs(card, timeZone))
  }

  const hasDue = card.due_date !== null || card.due_at !== null
  const value = hasDue ? (
    <DueBadge card={card} now={new Date()} timeZone={timeZone} />
  ) : (
    <span className="text-muted-foreground">{t('params.noDue')}</span>
  )
  if (!canEdit) return value

  const saveDue = (date: string, time: string) => {
    setDue({ date, time })
    if (!date) return save({ due_date: null, due_at: null })
    return time
      ? save({ due_at: zonedToIso(date, time, timeZone) })
      : save({ due_date: date, due_at: null })
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 px-2">
              {value}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('params.changeDue')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="grid w-auto gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label={t('fields.dueDate')}
            className="w-40"
            value={due.date}
            disabled={pending}
            onChange={(event) =>
              void saveDue(event.target.value, event.target.value ? due.time : '')
            }
          />
          <Input
            type="time"
            aria-label={t('fields.dueTime')}
            className="w-28"
            value={due.time}
            disabled={pending || !due.date}
            onChange={(event) => setDue({ ...due, time: event.target.value })}
            onBlur={() =>
              due.date && due.time !== dueInputs(card, timeZone).time && saveDue(due.date, due.time)
            }
          />
        </div>
        {hasDue && (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => saveDue('', '')}
          >
            {t('fields.clearDue')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function UrgentField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { save, pending } = useSave(card.key)
  return (
    <Checkbox
      id="card-urgent"
      checked={card.is_urgent}
      disabled={!canEdit || pending}
      onCheckedChange={(checked) => save({ is_urgent: checked === true })}
    />
  )
}

/** План в часах, шаг 0,5. */
function EstimateField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { save } = useSave(card.key)
  const [estimate, setEstimate] = useState(card.estimate_hours?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  const cancelled = useRef(false)
  const [synced, setSynced] = useState(card.estimate_hours)
  if (synced !== card.estimate_hours) {
    setSynced(card.estimate_hours)
    setEstimate(card.estimate_hours?.toString() ?? '')
  }

  if (!canEdit) {
    return card.estimate_hours === null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span>{String(card.estimate_hours).replace('.', ',')}</span>
    )
  }

  const commit = () => {
    const value = estimate.trim().replace(',', '.')
    const hours = value === '' ? null : Number(value)
    if (hours !== null && (Number.isNaN(hours) || hours < 0 || (hours * 2) % 1 !== 0)) {
      setError(t('fields.estimateInvalid'))
      return
    }
    setError(null)
    if (hours !== card.estimate_hours) void save({ estimate_hours: hours })
  }

  return (
    <div className="grid gap-1">
      <Input
        id="card-estimate"
        inputMode="decimal"
        className="h-8 w-28"
        value={estimate}
        placeholder={t('fields.estimatePlaceholder')}
        aria-invalid={!!error}
        aria-describedby={error ? 'card-estimate-error' : undefined}
        // Esc отменяет правку (как в названии), окно его не перехватывает
        data-own-escape
        onChange={(event) => setEstimate(event.target.value)}
        onBlur={() => {
          if (cancelled.current) cancelled.current = false
          else commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            cancelled.current = true
            setEstimate(card.estimate_hours?.toString() ?? '')
            setError(null)
            focusCardWindow(event.currentTarget)
          }
        }}
      />
      {error && (
        <p id="card-estimate-error" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
