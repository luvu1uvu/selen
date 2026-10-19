/**
 * Документ визуального редактора (Tiptap JSON) — так описание и комментарии хранятся на сервере
 * (docs/adr/0009-rich-text.md). Сервер проверяет его по белому списку, поэтому редактор настроен
 * ровно на те же узлы и атрибуты (extensions.ts).
 */
export interface RichTextNode {
  type: string
  attrs?: Record<string, unknown>
  content?: RichTextNode[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
}

export interface RichTextDoc extends RichTextNode {
  type: 'doc'
}

/** Пустой документ — без текста, упоминаний, картинок и линий (такое описание сохраняется как null). */
export function isEmptyDoc(doc: RichTextNode | null | undefined): boolean {
  if (!doc) return true
  if (['mention', 'image', 'horizontalRule'].includes(doc.type)) return false
  if (doc.type === 'text') return !doc.text?.trim()
  return (doc.content ?? []).every(isEmptyDoc)
}

/** Пользователь, которого можно упомянуть (GET /cards/{key}/mentionable). */
export interface MentionCandidate {
  id: string
  name: string
}
