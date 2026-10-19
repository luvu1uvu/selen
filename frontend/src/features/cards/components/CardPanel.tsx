import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/features/auth/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { api } from '@/shared/api/client'
import { CardTypeLabel } from '@/shared/components/CardTypeLabel'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { formatDateTime } from '@/shared/lib/dates'
import { formatDuration } from '@/shared/lib/duration'
import type { CardDetail, CardType, Collection } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { FormField } from '@/shared/ui/form-field'
import { Input } from '@/shared/ui/input'
import { NativeSelect } from '@/shared/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet'
import { useCard, useDeleteCard, useSetCardArchived, useUpdateCard } from '../queries'
import { CardAttachmentsSection } from './CardAttachmentsSection'
import { CardBlocksSection } from './CardBlocksSection'
import { CardChecklistsSection } from './CardChecklistsSection'
import { CardCommentsSection } from './CardCommentsSection'
import { CardDescriptionSection } from './CardDescriptionSection'
import { CardFieldsSection } from './CardFieldsSection'
import { CardHistory } from './CardHistory'
import { CardLabelsSection } from './CardLabelsSection'
import { CardLinksSection } from './CardLinksSection'
import { CardPeopleSection } from './CardPeopleSection'
import { CardRelationsSection } from './CardRelationsSection'
import { MoveCardDialog } from './MoveCardDialog'

function useActiveCardTypes() {
  return useQuery({
    queryKey: ['card-types'],
    queryFn: async () => (await api.get<Collection<CardType>>('/card-types')).data.data,
  })
}

/** Карточка в боковой панели поверх доски. У панели свой адрес /cards/DEV-123. */
export function CardPanel({ cardKey, onClose }: { cardKey: string; onClose: () => void }) {
  const { t: tc } = useTranslation()
  const cardQuery = useCard(cardKey)
  const card = cardQuery.data

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        closeLabel={tc('actions.close')}
      >
        {card ? (
          <CardDetails key={card.key} card={card} onDeleted={onClose} />
        ) : (
          <SheetHeader>
            <SheetTitle>{cardKey}</SheetTitle>
            <SheetDescription>{tc('states.loading')}</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}

function CardDetails({ card, onDeleted }: { card: CardDetail; onDeleted: () => void }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const types = useActiveCardTypes()
  const update = useUpdateCard(card.key)
  const setArchived = useSetCardArchived(card.key)
  const remove = useDeleteCard()
  const [title, setTitle] = useState(card.title)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const canEdit = card.permissions.edit && !card.archived_at

  // Карточка изменилась на сервере — подтягиваем название (паттерн «подстройка состояния при рендере»)
  const [synced, setSynced] = useState(card.title)
  if (synced !== card.title) {
    setSynced(card.title)
    setTitle(card.title)
  }

  const save = async (payload: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(payload)
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const toggleArchived = async () => {
    const archived = !card.archived_at
    try {
      await setArchived.mutateAsync(archived)
      toast.success(archived ? t('card.archivedToast') : t('card.restoredToast'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(card.key)
      toast.success(t('card.deletedToast'))
      onDeleted()
    } catch (error) {
      setDeleting(false)
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const copyLink = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/cards/${card.key}`)
    toast.success(t('card.linkCopied'))
  }

  const column = card.column.parent_name
    ? `${card.column.parent_name} / ${card.column.name}`
    : card.column.name
  const typeOptions = (types.data ?? []).some((type) => type.id === card.card_type.id)
    ? (types.data ?? [])
    : [card.card_type, ...(types.data ?? [])]

  return (
    <div className="grid gap-5 p-4 pt-0">
      <SheetHeader className="px-0">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="font-mono">{card.key}</span>
          <CardTypeLabel name={card.card_type.name} color={card.card_type.color} />
        </div>
        <SheetTitle className="sr-only">{card.title}</SheetTitle>
        <SheetDescription className="sr-only">{column}</SheetDescription>
      </SheetHeader>

      {card.archived_at && <Alert>{t('card.archived')}</Alert>}

      <PanelSection title={t('sections.blocks')}>
        <CardBlocksSection card={card} canEdit={canEdit} />
      </PanelSection>

      <FormField id="card-title" label={t('card.title')}>
        <Input
          id="card-title"
          value={title}
          disabled={!canEdit}
          maxLength={500}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() =>
            title.trim() && title.trim() !== card.title && save({ title: title.trim() })
          }
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </FormField>

      <div className="grid gap-1 text-sm">
        <span className="text-muted-foreground text-xs">{t('card.location')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {card.board.name} / {column} / {card.lane.name}
          </span>
          <Badge variant="secondary">{t(`categories.${card.column.category}`)}</Badge>
        </div>
      </div>

      <PanelSection title={t('sections.people')}>
        <CardPeopleSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.labels')}>
        <CardLabelsSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.fields')}>
        <FormField id="card-type" label={t('card.type')}>
          <NativeSelect
            id="card-type"
            value={card.card_type.id}
            disabled={!canEdit}
            onChange={(event) => save({ card_type_id: event.target.value })}
          >
            {typeOptions.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <CardFieldsSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.description')}>
        <CardDescriptionSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.checklists')}>
        <CardChecklistsSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.links')}>
        <CardLinksSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.relations')}>
        <CardRelationsSection card={card} canEdit={canEdit} />
      </PanelSection>

      <PanelSection title={t('sections.attachments')}>
        <CardAttachmentsSection card={card} />
      </PanelSection>

      <div className="text-muted-foreground grid gap-1 text-sm">
        <span>
          {t('card.createdBy', {
            name: card.created_by.name,
            date: formatDateTime(card.created_at, me?.timezone),
          })}
        </span>
        {card.first_started_at && (
          <span>
            {t('card.startedAt', { date: formatDateTime(card.first_started_at, me?.timezone) })}
          </span>
        )}
        {card.completed_at && (
          <span>
            {t('card.completedAt', { date: formatDateTime(card.completed_at, me?.timezone) })}
          </span>
        )}
        {card.metrics.lead_time_seconds !== null && (
          <span>
            {t('card.leadTime', { value: formatDuration(card.metrics.lead_time_seconds, t) })}
          </span>
        )}
        {card.metrics.cycle_time_seconds !== null && (
          <span>
            {t('card.cycleTime', { value: formatDuration(card.metrics.cycle_time_seconds, t) })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setMoving(true)}>
            {t('card.move')}
          </Button>
        )}
        {card.permissions.edit && (
          <Button
            variant="outline"
            size="sm"
            disabled={setArchived.isPending}
            onClick={toggleArchived}
          >
            {card.archived_at ? t('card.restore') : t('card.archive')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={copyLink}>
          <Link2 />
          {t('card.copyLink')}
        </Button>
        {card.permissions.delete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive ml-auto"
            onClick={() => setDeleting(true)}
          >
            <Trash2 />
            {t('card.delete')}
          </Button>
        )}
      </div>

      <PanelSection title={t('sections.comments')}>
        <CardCommentsSection card={card} />
      </PanelSection>

      <CardHistory cardKey={card.key} />

      {moving && <MoveCardDialog card={card} onClose={() => setMoving(false)} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('card.deleteTitle', { key: card.key })}
        description={t('card.deleteDescription', { title: card.title })}
        confirmLabel={t('card.deleteConfirm')}
        pending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
