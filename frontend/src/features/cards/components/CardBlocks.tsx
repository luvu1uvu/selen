import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/dates'
import type { CardBlock, CardDetail, CardSummary } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { useReturnFocusOnClose } from '@/shared/ui/restore-focus'
import { Textarea } from '@/shared/ui/textarea'
import { Hint } from '@/shared/components/Hint'
import { blockApi } from '../api'
import { useUnsavedText } from '../cardWindow'
import { useCardContentMutation } from '../queries'
import { CardPicker } from './CardPicker'
import { RelatedCardView } from './RelatedCardView'

/**
 * Активные блокировки (ADR-0011) — заметной плашкой сразу под рядом действий окна (README Kaiten, раздел 02: заблокированную
 * карточку видно сразу), со снятием. Новая блокировка — пунктом «+» окна (`adding` — форма открыта). Причина — текст
 * и/или блокирующая карточка; блокировка карточкой снимется сама, когда та станет готова.
 */
export function CardActiveBlocks({
  card,
  canEdit,
  adding,
  onAddDone,
}: {
  card: CardDetail
  canEdit: boolean
  adding: boolean
  onAddDone: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const resolve = useCardContentMutation((id: string) => blockApi.resolve(id))
  const active = card.blocks.filter((block) => !block.ended_at)
  if (active.length === 0 && !(canEdit && adding)) return null

  return (
    <div className="grid gap-2">
      {active.map((block) => (
        <div
          key={block.id}
          // Белый фон и красная полоса слева: на розовой заливке текст был ниже 4,5:1 (U-1 UX-ревью UI-1a)
          className="border-destructive/40 border-l-destructive bg-background grid gap-1 rounded-md border border-l-4 p-3 text-sm"
        >
          {/* Заблокирована карточкой — она в заголовке плашки: «Заблокирована карточкой DEV-…» (V-2 UX-ревью UI-1a) */}
          <span className="text-destructive flex min-w-0 flex-wrap items-center gap-1.5 font-medium">
            <Ban className="size-4 shrink-0" aria-hidden />
            {block.blocking_card ? t('blocks.blockedByCard') : t('facade.blocked')}
            {block.blocking_card && (
              <span className="text-foreground min-w-0 font-normal">
                <RelatedCardView card={block.blocking_card} />
              </span>
            )}
          </span>
          {block.reason && <span className="break-words whitespace-pre-line">{block.reason}</span>}
          <div className="flex items-center gap-2">
            <BlockMeta block={block} />
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={resolve.isPending}
                onClick={() =>
                  resolve
                    .mutateAsync(block.id)
                    .then(() => toast.success(t('blocks.resolved')))
                    .catch((error) => toast.error(getErrorMessage(error, tc('errors.generic'))))
                }
              >
                {t('blocks.resolve')}
              </Button>
            )}
          </div>
        </div>
      ))}
      {canEdit && adding && <BlockForm card={card} onDone={onAddDone} />}
    </div>
  )
}

/** История эпизодов блокировки (снятые) — секция «Блокировки» окна. */
export function CardBlocksHistory({ card }: { card: CardDetail }) {
  const ended = card.blocks.filter((block) => block.ended_at)
  return (
    <ul className="grid gap-2 text-sm">
      {ended.map((block) => (
        <li key={block.id} className="grid gap-0.5 border-l-2 pl-3">
          <BlockCause block={block} />
          <BlockMeta block={block} />
        </li>
      ))}
    </ul>
  )
}

function BlockCause({ block }: { block: CardBlock }) {
  const { t } = useTranslation('boards')
  return (
    <div className="grid gap-0.5">
      {block.blocking_card && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted-foreground shrink-0 text-xs">{t('blocks.byCard')}</span>
          <RelatedCardView card={block.blocking_card} />
        </span>
      )}
      {block.reason && <span className="break-words whitespace-pre-line">{block.reason}</span>}
    </div>
  )
}

function BlockMeta({ block }: { block: CardBlock }) {
  const { t } = useTranslation('boards')
  const { data: me } = useCurrentUser()
  const started = t('blocks.started', {
    name: block.started_by.name,
    date: formatDateTime(block.started_at, me?.timezone),
  })
  if (!block.ended_at) {
    return <span className="text-muted-foreground text-xs">{started}</span>
  }
  const date = formatDateTime(block.ended_at, me?.timezone)
  const ended =
    block.end_reason === 'blocker_completed'
      ? t('blocks.endedAuto', { date })
      : block.end_reason === 'blocker_deleted'
        ? t('blocks.endedDeleted', { date })
        : t('blocks.ended', { name: block.ended_by?.name ?? t('history.system'), date })
  return (
    <span className="text-muted-foreground text-xs">
      {started} · {ended}
    </span>
  )
}

/**
 * Новая блокировка: текст причины и/или блокирующая карточка — хотя бы одно. Форма — в рамке с заголовком «Новая
 * блокировка» (V-1 UX-ревью UI-1a); «Отмена» и «Заблокировать» возвращают фокус на «+», который её открыл (U-9).
 */
function BlockForm({ card, onDone }: { card: CardDetail; onDone: () => void }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const titleId = useId()
  const returnFocus = useReturnFocusOnClose()
  const done = () => {
    returnFocus()
    onDone()
  }
  const [reason, setReason] = useState('')
  const [blocker, setBlocker] = useState<CardSummary | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useUnsavedText(reason.trim() !== '')
  const add = useCardContentMutation(
    (payload: { reason: string | null; blocking_card: string | null }) =>
      blockApi.add(card.key, payload),
  )

  const submit = async () => {
    if (!reason.trim() && !blocker) {
      setError(t('blocks.causeRequired'))
      return
    }
    try {
      await add.mutateAsync({ reason: reason.trim() || null, blocking_card: blocker?.key ?? null })
      toast.success(t('blocks.added'))
      done()
    } catch (e) {
      toast.error(getErrorMessage(e, tc('errors.generic')))
    }
  }

  return (
    <form
      className="grid gap-2 rounded-md border p-3"
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <h3 id={titleId} className="text-sm font-medium">
        {t('blocks.newTitle')}
      </h3>
      <Textarea
        value={reason}
        autoFocus
        maxLength={1000}
        rows={2}
        aria-label={t('blocks.reason')}
        placeholder={t('blocks.reasonPlaceholder')}
        onChange={(event) => {
          setReason(event.target.value)
          setError(null)
        }}
      />
      {blocker ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">{t('blocks.byCard')}</span>
          <span className="font-mono text-xs">{blocker.key}</span>
          <span className="truncate">{blocker.title}</span>
          <Hint label={t('blocks.clearCard')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t('blocks.clearCard')}
              onClick={() => setBlocker(null)}
            >
              <X />
            </Button>
          </Hint>
        </div>
      ) : picking ? (
        <CardPicker
          spaceKey={card.space.key}
          excludeKey={card.key}
          label={t('blocks.pickCard')}
          onPick={(picked) => {
            setBlocker(picked)
            setPicking(false)
            setError(null)
          }}
        />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => setPicking(true)}
        >
          {t('blocks.chooseCard')}
        </Button>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={add.isPending}>
          {t('blocks.submit')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={done}>
          {tc('actions.cancel')}
        </Button>
      </div>
    </form>
  )
}
