import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { UserAvatar } from '@/shared/components/UserAvatar'
import type { RichTextDoc } from '@/shared/components/rich-text/doc'
import type { CardDetail, Comment } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { useCommentMutation, useComments, useMentionableLoader } from '../queries'
import { useAttachmentUpload } from '../useAttachmentUpload'
import { LazyRichTextEditor, LazyRichTextView } from './RichText'
import { TimeAgo } from './TimeAgo'

/**
 * Комментарии — от старых к новым. Писать могут все роли (включая commenter); свой — изменить
 * (пометка «изменено») и удалить (остаётся «Комментарий удалён»).
 */
export function CardCommentsSection({ card }: { card: CardDetail }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const commentsQuery = useComments(card.key)
  const mutate = useCommentMutation(card.key)
  const loadMentionable = useMentionableLoader(card.key)
  const { upload } = useAttachmentUpload(card.key)
  // Новый редактор после отправки — так он очищается
  const [composerKey, setComposerKey] = useState(0)
  const canComment = card.permissions.comment && !card.archived_at
  const names = commentsQuery.data?.users ?? {}

  const onUpload = async (file: File) => {
    const attachment = await upload(file)
    if (attachment && attachment.kind !== 'image') {
      toast.success(t('attachments.uploaded', { name: attachment.name }))
    }
    return attachment?.kind === 'image' ? attachment.id : null
  }

  const run = async (action: Parameters<typeof mutate.mutateAsync>[0]) => {
    try {
      await mutate.mutateAsync(action)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
      return false
    }
  }

  return (
    <div className="grid gap-4">
      {commentsQuery.isError && (
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      )}
      {commentsQuery.data?.data.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('comments.none')}</p>
      )}
      <ol className="grid gap-4">
        {commentsQuery.data?.data.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            names={names}
            loadMentionable={loadMentionable}
            onUpload={onUpload}
            busy={mutate.isPending}
            onSave={(body) => run({ kind: 'update', id: comment.id, body })}
            onDelete={() => run({ kind: 'delete', id: comment.id })}
          />
        ))}
      </ol>
      {canComment && (
        <LazyRichTextEditor
          key={composerKey}
          initial={null}
          names={names}
          loadMentionable={loadMentionable}
          onUpload={onUpload}
          label={t('comments.new')}
          placeholder={t('comments.placeholder')}
          submitLabel={t('comments.send')}
          busy={mutate.isPending}
          onSubmit={async (doc) => {
            if (!doc) return
            if (await run({ kind: 'add', body: doc })) setComposerKey((key) => key + 1)
          }}
        />
      )}
    </div>
  )
}

function CommentItem({
  comment,
  names,
  loadMentionable,
  onUpload,
  busy,
  onSave,
  onDelete,
}: {
  comment: Comment
  names: Record<string, string>
  loadMentionable: ReturnType<typeof useMentionableLoader>
  onUpload: (file: File) => Promise<string | null>
  busy: boolean
  onSave: (body: RichTextDoc) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const { t } = useTranslation('boards')
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex gap-3" aria-label={t('comments.by', { name: comment.author.name })}>
      <UserAvatar id={comment.author.id} name={comment.author.name} />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          <span className="text-foreground font-medium">{comment.author.name}</span>
          {/* Относительное время, точное — в подсказке (решение PM 22.10) */}
          <TimeAgo at={comment.created_at} />
          {comment.edited_at && !comment.deleted_at && <span>{t('comments.edited')}</span>}
        </div>
        {comment.body === null ? (
          <p className="text-muted-foreground text-sm italic">{t('comments.deleted')}</p>
        ) : editing ? (
          <LazyRichTextEditor
            initial={comment.body}
            names={names}
            loadMentionable={loadMentionable}
            onUpload={onUpload}
            label={t('comments.edit')}
            submitLabel={t('comments.save')}
            busy={busy}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (doc) => {
              if (doc && (await onSave(doc))) setEditing(false)
            }}
          />
        ) : (
          <LazyRichTextView doc={comment.body} names={names} />
        )}
        {comment.permissions.modify && !editing && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(true)}>
              {t('comments.edit')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {t('comments.delete')}
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          pending={busy}
          title={t('comments.deleteTitle')}
          description={t('comments.deleteText')}
          confirmLabel={t('comments.delete')}
          onConfirm={async () => {
            await onDelete()
            setConfirming(false)
          }}
        />
      </div>
    </li>
  )
}
