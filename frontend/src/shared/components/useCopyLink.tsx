import { useState } from 'react'
import { toast } from 'sonner'
import { copyText } from '@/shared/lib/browser'
import { ManualCopyDialog } from './ManualCopyDialog'

/**
 * Скопировать ссылку в буфер обмена: скопировалась — уведомление `copied`; браузер не дал — окно с выделенной ссылкой
 * для ручного копирования (`ManualCopyDialog`). Окно (`dialog`) рисует вызывающий.
 */
export function useCopyLink() {
  const [manual, setManual] = useState<string | null>(null)
  const copy = async (url: string, copied: string) => {
    if (await copyText(url)) toast.success(copied)
    else setManual(url)
  }
  return { copy, dialog: <ManualCopyDialog url={manual} onClose={() => setManual(null)} /> }
}
