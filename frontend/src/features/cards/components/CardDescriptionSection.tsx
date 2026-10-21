import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useMentionableLoader, useUpdateCard } from '../queries'
import { useAttachmentUpload } from '../useAttachmentUpload'
import { CardSection } from './CardSection'
import { LazyRichTextEditor, LazyRichTextView } from './RichText'

/**
 * «Описание» окна карточки (сворачивается, README Kaiten, раздел 02): визуальный редактор с упоминаниями и вставкой
 * картинок (они становятся вложениями карточки). Пустое — серая подсказка, у редактора по щелчку открывает редактор;
 * непустое правится карандашом в заголовке (щелчок по тексту не годится — в нём ссылки и упоминания).
 * Сервер проверяет документ по белому списку; упомянуть можно только видящих карточку.
 */
export function CardDescriptionSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [editing, setEditing] = useState(false)
  const update = useUpdateCard(card.key)
  const loadMentionable = useMentionableLoader(card.key)
  const { upload } = useAttachmentUpload(card.key)

  const action =
    canEdit && card.description && !editing ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('card.editDescription')}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('card.editDescription')}</TooltipContent>
      </Tooltip>
    ) : undefined

  return (
    <CardSection
      id="description"
      title={t('sections.description')}
      action={action}
      forceOpen={editing}
    >
      {editing ? (
        <LazyRichTextEditor
          initial={card.description}
          names={card.mentioned_users}
          loadMentionable={loadMentionable}
          onUpload={async (file) => {
            const attachment = await upload(file)
            return attachment?.kind === 'image' ? attachment.id : null
          }}
          label={t('card.description')}
          placeholder={t('card.descriptionPlaceholder')}
          submitLabel={t('card.saveDescription')}
          busy={update.isPending}
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={async (doc) => {
            try {
              await update.mutateAsync({ description: doc })
              toast.success(t('card.saved'))
              setEditing(false)
            } catch (error) {
              toast.error(getErrorMessage(error, tc('errors.generic')))
            }
          }}
        />
      ) : card.description ? (
        <LazyRichTextView doc={card.description} names={card.mentioned_users} />
      ) : canEdit ? (
        <button
          type="button"
          className="text-muted-foreground border-input hover:border-ring hover:text-foreground focus-visible:ring-ring/50 min-h-16 rounded-md border border-dashed px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px]"
          onClick={() => setEditing(true)}
        >
          {t('card.emptyDescription')}
        </button>
      ) : (
        <p className="text-muted-foreground text-sm">{t('card.noDescription')}</p>
      )}
    </CardSection>
  )
}
