import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileIcon, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { sizeParts } from '@/shared/lib/size'
import type { Attachment, CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { deleteAttachment } from '../api'
import { useCardContentMutation } from '../queries'
import type { UploadProgress } from '../useAttachmentUpload'

/**
 * Файлы карточки: картинки — превью (тот же файл, уменьшенный; миниатюры не генерируются) и просмотр
 * в полный размер; видео mp4/webm/mov — встроенный плеер с перемоткой (если браузер не может его
 * воспроизвести — сообщение и кнопка «Скачать»); остальное — скачивание.
 * Прикладывать могут все роли (permissions.comment), удалять — загрузивший, editor и admin.
 * Загрузку ведёт окно карточки (пункт «+», перетаскивание файла на окно, кнопка секции): `uploads` — её ход.
 */
export function CardAttachmentsSection({
  card,
  canAttach,
  uploads,
  onPickFiles,
}: {
  card: CardDetail
  canAttach: boolean
  uploads: UploadProgress[]
  onPickFiles: () => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const remove = useCardContentMutation((id: string) => deleteAttachment(id))
  const [preview, setPreview] = useState<Attachment | null>(null)

  const onRemove = async (attachment: Attachment) => {
    try {
      await remove.mutateAsync(attachment.id)
      toast.success(t('attachments.removed'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const media = card.attachments.filter((a) => a.kind !== 'file')
  const files = card.attachments.filter((a) => a.kind === 'file')

  return (
    <div className="grid gap-3">
      {canAttach && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={onPickFiles}>
          <Paperclip />
          {t('attachments.add')}
        </Button>
      )}
      {uploads.map((progress) => (
        <UploadRow key={progress.id} progress={progress} />
      ))}
      {card.attachments.length === 0 && uploads.length === 0 && (
        <span className="text-muted-foreground text-sm">{t('attachments.none')}</span>
      )}

      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((attachment) => (
            <figure
              key={attachment.id}
              className="group relative overflow-hidden rounded-md border"
            >
              {attachment.kind === 'image' ? (
                <button
                  type="button"
                  className="block w-full"
                  aria-label={t('attachments.open', { name: attachment.name })}
                  onClick={() => setPreview(attachment)}
                >
                  <img
                    src={`${attachment.url}?inline=1`}
                    alt={attachment.name}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                </button>
              ) : (
                <VideoPlayer attachment={attachment} />
              )}
              <figcaption className="flex items-center gap-1 px-2 py-1 text-xs">
                <span className="truncate" title={attachment.name}>
                  {attachment.name}
                </span>
                <AttachmentActions attachment={attachment} onRemove={onRemove} />
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="grid gap-1">
          {files.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2 text-sm">
              <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <a href={attachment.url} className="truncate hover:underline" download>
                {attachment.name}
              </a>
              <span className="text-muted-foreground shrink-0 text-xs">
                {(({ value, unit }) => t(`attachments.${unit}`, { value }))(
                  sizeParts(attachment.size),
                )}
              </span>
              <AttachmentActions attachment={attachment} onRemove={onRemove} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent closeLabel={tc('actions.close')} className="max-w-[95vw] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={`${preview.url}?inline=1`}
              alt={preview.name}
              className="max-h-[80vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Встроенный плеер. Видео с Mac (.mov, часто HEVC) не каждый браузер умеет показать: тогда <video> сообщает
 * об ошибке или загружает только звук (ширина кадра 0). В обоих случаях вместо плеера — сообщение и «Скачать».
 */
function VideoPlayer({ attachment }: { attachment: Attachment }) {
  const { t } = useTranslation('boards')
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        role="status"
        className="bg-muted text-muted-foreground flex aspect-video flex-col items-center justify-center gap-2 p-2 text-center text-xs"
      >
        <span>{t('attachments.cannotPlay')}</span>
        <Button variant="outline" size="sm" asChild>
          <a href={attachment.url} download>
            <Download />
            {t('attachments.downloadVideo')}
          </a>
        </Button>
      </div>
    )
  }

  return (
    <video
      src={`${attachment.url}?inline=1`}
      controls
      preload="metadata"
      aria-label={attachment.name}
      className="aspect-video w-full bg-black"
      onError={() => setFailed(true)}
      onLoadedMetadata={(event) => event.currentTarget.videoWidth === 0 && setFailed(true)}
    />
  )
}

function AttachmentActions({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: (attachment: Attachment) => void
}) {
  const { t } = useTranslation('boards')
  return (
    <span className="ml-auto flex shrink-0 items-center">
      <Button variant="ghost" size="icon" className="size-6" asChild>
        <a
          href={attachment.url}
          download
          aria-label={t('attachments.download', { name: attachment.name })}
        >
          <Download />
        </a>
      </Button>
      {attachment.permissions.delete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t('attachments.remove', { name: attachment.name })}
          onClick={() => onRemove(attachment)}
        >
          <Trash2 />
        </Button>
      )}
    </span>
  )
}

function UploadRow({ progress }: { progress: UploadProgress }) {
  const { t } = useTranslation('boards')
  return (
    <div className="grid gap-1 text-xs">
      <span className="truncate">{t('attachments.uploading', { name: progress.name })}</span>
      <div
        role="progressbar"
        aria-label={progress.name}
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-muted h-1.5 overflow-hidden rounded"
      >
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  )
}
