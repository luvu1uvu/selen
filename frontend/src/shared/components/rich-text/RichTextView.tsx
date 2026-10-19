import { EditorContent, useEditor } from '@tiptap/react'
import { cn } from '@/shared/lib/utils'
import type { RichTextDoc } from './doc'
import { buildExtensions } from './extensions'

/**
 * Показ документа: тот же Tiptap в режиме «только чтение» с той же схемой — HTML с сервера не
 * вставляется (никакого dangerouslySetInnerHTML), неизвестное просто не отрисуется.
 */
export default function RichTextView({
  doc,
  names,
  className,
}: {
  doc: RichTextDoc
  names: Record<string, string>
  className?: string
}) {
  const editor = useEditor(
    {
      editable: false,
      // Документ и имена — зависимости редактора: при их смене он пересоздаётся
      extensions: buildExtensions({ placeholderNames: () => names }),
      content: doc,
      immediatelyRender: true,
    },
    [doc, names],
  )

  return <EditorContent editor={editor} className={cn('rich-text', className)} />
}
