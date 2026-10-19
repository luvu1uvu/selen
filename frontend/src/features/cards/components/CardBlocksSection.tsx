import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/dates'
import type { CardBlock, CardDetail, CardSummary } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { blockApi } from '../api'
import { useCardContentMutation } from '../queries'
import { CardPicker } from './CardPicker'
import { RelatedCardView } from './RelatedCardView'

/**
 * Блокировки (ADR-0011): активные — заметным блоком со снятием, ниже — история эпизодов.
 * Причина — текст и/или блокирующая карточка; блокировка карточкой снимется сама, когда та станет готова.
 */
export function CardBlocksSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [adding, setAdding] = useState(false)
  const resolve = useCardContentMutation((id: string) => blockApi.resolve(id))
  const active = card.blocks.filter((block) => !block.ended_at)
  const ended = card.blocks.filter((block) => block.ended_at)

  return (
    <div className="grid gap-3">
      {active.length === 0 && !adding && (
        <span className="text-muted-foreground text-sm">{t('blocks.none')}</span>
      )}
      {active.map((block) => (
        <div
          key={block.id}
          className="grid gap-1 rounded-md border border-red-300 bg-red-50 p-2 text-sm dark:border-red-900 dark:bg-red-950/40"
        >
          <BlockCause block={block} />
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

      {canEdit &&
        (adding ? (
          <BlockForm card={card} onDone={() => setAdding(false)} />
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setAdding(true)}
          >
            <Ban />
            {t('blocks.add')}
          </Button>
        ))}

      {ended.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            {t('blocks.history', { count: ended.length })}
          </summary>
          <ul className="mt-2 grid gap-2">
            {ended.map((block) => (
              <li key={block.id} className="grid gap-0.5 border-l-2 pl-3">
                <BlockCause block={block} />
                <BlockMeta block={block} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
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

/** Новая блокировка: текст причины и/или блокирующая карточка — хотя бы одно. */
function BlockForm({ card, onDone }: { card: CardDetail; onDone: () => void }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [reason, setReason] = useState('')
  const [blocker, setBlocker] = useState<CardSummary | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      onDone()
    } catch (e) {
      toast.error(getErrorMessage(e, tc('errors.generic')))
    }
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Textarea
        value={reason}
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
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {tc('actions.cancel')}
        </Button>
      </div>
    </form>
  )
}
