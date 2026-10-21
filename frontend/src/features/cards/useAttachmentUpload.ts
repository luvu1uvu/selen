import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { refreshBoards } from '@/features/boards/queries'
import { getErrorMessage, getErrorStatus } from '@/shared/api/errors'
import type { Attachment } from '@/shared/types/api'
import { uploadAttachment } from './api'
import { boardOf, cardKeys } from './queries'

/** Лимит — как на сервере (ADR-0010): nginx, PHP и валидация. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

export interface UploadProgress {
  id: number
  name: string
  percent: number
}

/**
 * Загрузка вложений карточки — из блока «Файлы» и из редактора (вставка и перетаскивание).
 * Проверяет размер до отправки, показывает прогресс, после загрузки перечитывает карточку и доску.
 */
export function useAttachmentUpload(cardKey: string) {
  const { t } = useTranslation('boards')
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<UploadProgress[]>([])

  const upload = async (file: File): Promise<Attachment | null> => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(t('attachments.tooLarge', { name: file.name }))
      return null
    }
    const id = Date.now() + Math.random()
    setUploads((list) => [...list, { id, name: file.name, percent: 0 }])
    try {
      const attachment = await uploadAttachment(cardKey, file, (percent) =>
        setUploads((list) => list.map((u) => (u.id === id ? { ...u, percent } : u))),
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cardKeys.detail(cardKey) }),
        refreshBoards(queryClient, boardOf(queryClient, cardKey)),
      ])
      return attachment
    } catch (error) {
      toast.error(
        getErrorStatus(error) === 413
          ? t('attachments.tooLarge', { name: file.name })
          : getErrorMessage(error, t('attachments.uploadFailed', { name: file.name })),
      )
      return null
    } finally {
      setUploads((list) => list.filter((u) => u.id !== id))
    }
  }

  return { upload, uploads }
}
