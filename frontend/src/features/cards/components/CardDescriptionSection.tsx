import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { useMentionableLoader, useUpdateCard } from '../queries'
import { useAttachmentUpload } from '../useAttachmentUpload'
import { LazyRichTextEditor, LazyRichTextView } from './RichText'

/**
 * Описание: визуальный редактор с упоминаниями и вставкой картинок (они становятся вложениями карточки).
 * Сервер проверяет документ по белому списку; упомянуть можно только видящих карточку.
 */
export function CardDescriptionSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [editing, setEditing] = useState(false)
  const update = useUpdateCard(card.key)
  const loadMentionable = useMentionableLoader(card.key)
  const { upload } = useAttachmentUpload(card.key)

  if (editing) {
    return (
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
    )
  }

  return (
    <div className="grid gap-2">
      {card.description ? (
        <LazyRichTextView doc={card.description} names={card.mentioned_users} />
      ) : (
        <p className="text-muted-foreground text-sm">{t('card.noDescription')}</p>
      )}
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => setEditing(true)}
        >
          <Pencil />
          {card.description ? t('card.editDescription') : t('card.addDescription')}
        </Button>
      )}
    </div>
  )
}
