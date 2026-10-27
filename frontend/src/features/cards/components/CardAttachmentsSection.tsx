import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileIcon, Link2, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { sizeParts } from '@/shared/lib/size'
import type { Attachment, CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Hint } from '@/shared/components/Hint'
import { TruncatedTrigger } from '@/shared/components/TruncatedText'
import { useCopyLink } from '@/shared/components/useCopyLink'
import { deleteAttachment } from '../api'
import { fileLink } from '../cardWindow'
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
    <div className="grid grid-cols-1 gap-3">
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
              // Рамка фокуса превью — у figure: кнопка целиком под картинкой, её рамка была бы не видна, а снаружи кнопки
              // её срезал бы overflow-hidden (U-3 UX-ревью UI-1a). Подложка muted — прозрачные картинки и скриншоты на
              // белом видны в обеих темах («Редизайн»)
              className="group bg-muted has-[>button:focus-visible]:outline-ring relative overflow-hidden rounded-md border has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2"
            >
              {attachment.kind === 'image' ? (
                <button
                  type="button"
                  className="block w-full outline-none"
                  aria-label={t('attachments.open', { name: attachment.name })}
                  onClick={() => setPreview(attachment)}
                >
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                </button>
              ) : (
                <VideoPlayer attachment={attachment} />
              )}
              <figcaption className="flex items-center gap-1 px-2 py-1 text-xs">
                <FileNameLink attachment={attachment} />
                <AttachmentActions attachment={attachment} onRemove={onRemove} />
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="grid grid-cols-1 gap-1">
          {files.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2 text-sm">
              <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <FileNameLink attachment={attachment} />
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

      {/* Внизу секции, как «Добавить чек-лист» и «Добавить ссылку» (U-8 UX-ревью UI-1a) */}
      {canAttach && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 justify-self-start"
          onClick={onPickFiles}
        >
          <Paperclip />
          {t('attachments.add')}
        </Button>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent closeLabel={tc('actions.close')} className="max-w-[95vw] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <img
              src={preview.url}
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
          <a href={downloadUrl(attachment)} download>
            <Download />
            {t('attachments.downloadVideo')}
          </a>
        </Button>
      </div>
    )
  }

  return (
    <video
      src={attachment.url}
      controls
      preload="metadata"
      aria-label={attachment.name}
      // Рамка фокуса — внутри: снаружи её срезал бы overflow-hidden у figure
      // eslint-disable-next-line no-restricted-syntax -- поля вокруг видео чёрные в любой теме, как у плееров
      className="aspect-video w-full bg-black focus-visible:-outline-offset-2"
      onError={() => setFailed(true)}
      onLoadedMetadata={(event) => event.currentTarget.videoWidth === 0 && setFailed(true)}
    />
  )
}

/** «Скачать» — всегда скачиванием, даже картинку, видео и PDF, которые по ссылке открываются в браузере. */
function downloadUrl(attachment: Attachment) {
  return `${attachment.url}?download=1`
}

/**
 * Имя файла — ссылка: то, что браузер показывает сам (картинки, видео, PDF по содержимому), открывается в новой
 * вкладке, остальное скачивается; «Скачать» — отдельной кнопкой (решение PM 22.10, UI-1b). Обрезанное имя — полностью в
 * подсказке у ссылки, по наведению и по фокусу (под превью на него остаётся ~140 px, U-5 UX-ревью UI-1b).
 */
function FileNameLink({ attachment }: { attachment: Attachment }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const opens = attachment.opens_in_browser
  return (
    <TruncatedTrigger text={attachment.name} nameRef={ref}>
      <a
        ref={ref}
        href={attachment.url}
        className="min-w-0 truncate hover:underline"
        {...(opens ? { target: '_blank', rel: 'noopener noreferrer' } : { download: true })}
      >
        {attachment.name}
      </a>
    </TruncatedTrigger>
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
  const copy = useCopyLink()
  return (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      <Hint label={t('attachments.copyLink', { name: attachment.name })}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t('attachments.copyLink', { name: attachment.name })}
          // Ссылку можно отправить коллеге: откроется у того, кто видит карточку (UI-1b, LATER-51)
          onClick={() => copy.copy(fileLink(attachment), t('attachments.linkCopied'))}
        >
          <Link2 />
        </Button>
      </Hint>
      <Hint label={t('attachments.download', { name: attachment.name })}>
        <Button variant="ghost" size="icon" className="size-6" asChild>
          <a
            href={downloadUrl(attachment)}
            download
            aria-label={t('attachments.download', { name: attachment.name })}
          >
            <Download />
          </a>
        </Button>
      </Hint>
      {attachment.permissions.delete && (
        <Hint label={t('attachments.remove', { name: attachment.name })}>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t('attachments.remove', { name: attachment.name })}
            onClick={() => onRemove(attachment)}
          >
            <Trash2 />
          </Button>
        </Hint>
      )}
      {copy.dialog}
    </span>
  )
}

function UploadRow({ progress }: { progress: UploadProgress }) {
  const { t } = useTranslation('boards')
  return (
    <div className="grid grid-cols-1 gap-1 text-xs">
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
