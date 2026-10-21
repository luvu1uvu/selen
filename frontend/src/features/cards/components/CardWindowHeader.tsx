import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { formatDateTime, formatRelative } from '@/shared/lib/dates'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { cardLink, focusCardWindow, useUnsavedText } from '../cardWindow'
import { useUpdateCard } from '../queries'
import { PersonLine, PersonPicker } from './PersonPicker'

/**
 * Шапка окна карточки (README Kaiten, раздел 02): крупное название (правится на месте), строка «DEV-12 · Заказчик ФИО»,
 * серая строка «Создана N назад · Перемещена N назад» с точным временем в подсказке.
 */
export function CardWindowHeader({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const update = useUpdateCard(card.key)
  const column = card.column.parent_name
    ? `${card.column.parent_name} / ${card.column.name}`
    : card.column.name

  const copyLink = async () => {
    await navigator.clipboard?.writeText(cardLink(card.key))
    toast.success(t('card.linkCopied'))
  }

  const changeCustomer = async (id: string) => {
    if (id === card.customer.id) return
    try {
      await update.mutateAsync({ customer_id: id })
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <header className="grid gap-1.5 pr-10">
      {canEdit ? (
        <>
          <DialogTitle className="sr-only">{card.title}</DialogTitle>
          <TitleField card={card} />
        </>
      ) : (
        <DialogTitle className="text-xl leading-snug font-semibold break-words">
          {card.title}
        </DialogTitle>
      )}
      <DialogDescription className="sr-only">
        {card.key} · {card.board.name} / {column}
      </DialogDescription>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="focus-visible:ring-ring/50 rounded-sm font-mono text-xs outline-none hover:underline focus-visible:ring-[3px]"
              aria-label={`${card.key}. ${t('card.copyKeyLink')}`}
              onClick={copyLink}
            >
              {card.key}
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('card.copyKeyLink')}</TooltipContent>
        </Tooltip>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <span className="text-muted-foreground">{t('card.customer')}</span>
        {canEdit ? (
          <PersonPicker
            spaceKey={card.space.key}
            label={t('card.changeCustomer')}
            selected={[card.customer.id]}
            current={[card.customer]}
            disabled={update.isPending}
            onSelect={(user) => void changeCustomer(user.id)}
          >
            <Button
              variant="ghost"
              size="sm"
              className="-ml-1 h-7 px-1.5"
              aria-label={t('card.customerButton', { name: card.customer.name })}
            >
              <PersonLine person={card.customer} compact />
            </Button>
          </PersonPicker>
        ) : (
          <PersonLine person={card.customer} compact />
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
        <TimeAgo
          at={card.created_at}
          text={(time) => t('card.created', { time })}
          hint={(date) => t('card.createdHint', { date, name: card.created_by.name })}
        />
        {card.moved_at && (
          <>
            <span aria-hidden>·</span>
            <TimeAgo
              at={card.moved_at}
              text={(time) => t('card.moved', { time })}
              hint={(date) => date}
            />
          </>
        )}
      </div>
    </header>
  )
}

/** «Создана 3 дня назад»: точное время — в подсказке, по наведению и по фокусу. */
function TimeAgo({
  at,
  text,
  hint,
}: {
  at: string
  text: (time: string) => string
  hint: (date: string) => string
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

/**
 * Название, которое правится на месте: Enter или уход фокуса — сохранить, Esc — отменить правку (окно не
 * закрывается). Изменённое и не сохранённое название — несохранённый текст окна.
 */
function TitleField({ card }: { card: CardDetail }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const update = useUpdateCard(card.key)
  const [title, setTitle] = useState(card.title)
  // Сохранение уходит при потере фокуса — в том же событии, что щелчок по ✕: флаг ставим сразу, а не по ответу
  const [saving, setSaving] = useState(false)
  const cancelled = useRef(false)
  const field = useRef<HTMLTextAreaElement>(null)

  // Карточка изменилась на сервере — подтягиваем название (паттерн «подстройка состояния при рендере»)
  const [synced, setSynced] = useState(card.title)
  if (synced !== card.title) {
    setSynced(card.title)
    setTitle(card.title)
  }
  // Отправленное название — уже не «несохранённое»: вопрос при закрытии во время сохранения не нужен
  useUnsavedText(title.trim() !== '' && title.trim() !== card.title && !saving)

  // Высота — по тексту: название переносится на сколько нужно строк; окно сузили (поворот телефона) — пересчитать
  useLayoutEffect(() => {
    const element = field.current
    if (!element) return
    const fit = () => {
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight}px`
    }
    fit()
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      fit()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [title])

  const save = async () => {
    const value = title.trim()
    if (!value || value === card.title) {
      setTitle(card.title)
      return
    }
    setSaving(true)
    try {
      await update.mutateAsync({ title: value })
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <textarea
      ref={field}
      rows={1}
      value={title}
      maxLength={500}
      aria-label={t('card.title')}
      data-own-escape
      className="hover:border-input focus-visible:border-ring focus-visible:ring-ring/50 -mx-1.5 w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xl leading-snug font-semibold outline-none focus-visible:ring-[3px]"
      onChange={(event) => setTitle(event.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          cancelled.current = true
          setTitle(card.title)
          focusCardWindow(event.currentTarget)
        }
      }}
      onBlur={() => {
        if (cancelled.current) {
          cancelled.current = false
          return
        }
        void save()
      }}
    />
  )
}
