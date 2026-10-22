import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorContent, ReactRenderer, useEditor, useEditorState, type Editor } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { Hint } from '@/shared/components/Hint'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { isEmptyDoc, type MentionCandidate, type RichTextDoc } from './doc'
import { buildExtensions, isAllowedUrl } from './extensions'
import { MentionList, type MentionListHandle } from './MentionList'
import { RICH_TEXT_POPUP_ATTRIBUTE, setOpenMentionPopup } from './popup'

export interface RichTextEditorProps {
  initial: RichTextDoc | null
  /** Имена уже упомянутых (в документе — только id). */
  names: Record<string, string>
  /** Кого можно упомянуть — с сервера (только видящие карточку). */
  loadMentionable: () => Promise<MentionCandidate[]>
  /**
   * Загрузить файл из буфера или перетаскиванием как вложение карточки.
   * Вернуть id вложения-картинки (вставится в текст) или null (обычный файл — только приложен).
   */
  onUpload?: (file: File) => Promise<string | null>
  onSubmit: (doc: RichTextDoc | null) => void | Promise<void>
  onCancel?: () => void
  submitLabel: string
  label: string
  placeholder?: string
  busy?: boolean
  autoFocus?: boolean
  /** Текст отличается от исходного (несохранённые изменения) — для окна карточки (UI-1a). */
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Визуальный редактор (Tiptap): панель форматирования, Markdown-сокращения, @упоминания,
 * вставка картинок из буфера и перетаскиванием. Ctrl/Cmd+Enter — сохранить.
 * Отдельный ленивый чанк: доску не утяжеляет.
 */
export default function RichTextEditor({
  initial,
  names,
  loadMentionable,
  onUpload,
  onSubmit,
  onCancel,
  submitLabel,
  label,
  placeholder,
  busy = false,
  autoFocus = false,
  onDirtyChange,
}: RichTextEditorProps) {
  const { t } = useTranslation()
  const [live] = useState(() => new EditorBridge(names, onUpload))
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [empty, setEmpty] = useState(isEmptyDoc(initial))

  useEffect(() => {
    live.update(names, onUpload)
  }, [live, onUpload, names])

  // Исходный документ — как его видит редактор (после разбора), чтобы сравнение не зависело от формы initial
  const baseline = useRef<string | null>(null)
  const dirty = useRef(false)
  const reportDirty = useRef(onDirtyChange)
  useEffect(() => {
    reportDirty.current = onDirtyChange
  })

  const editor = useEditor({
    immediatelyRender: true,
    autofocus: autoFocus ? 'end' : false,
    content: initial ?? undefined,
    extensions: buildExtensions({
      placeholderNames: () => live.names(),
      suggestion: {
        items: async ({ query }) => {
          const candidates = await loadMentionable()
          live.remember(candidates)
          const q = query.toLowerCase()
          return candidates.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8)
        },
        render: mentionPopup,
      },
    }),
    editorProps: {
      attributes: {
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'rich-text min-h-24 px-3 py-2 outline-none',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          live.submit()
          return true
        }
        return false
      },
      handlePaste: (_view, event) => uploadFiles(Array.from(event.clipboardData?.files ?? [])),
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length) return false
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        return uploadFiles(files, at)
      },
    },
    onCreate: ({ editor }) => {
      baseline.current = JSON.stringify(editor.getJSON())
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON() as RichTextDoc
      setEmpty(isEmptyDoc(doc))
      const changed = JSON.stringify(doc) !== baseline.current
      if (changed !== dirty.current) {
        dirty.current = changed
        reportDirty.current?.(changed)
      }
    },
  })

  /** Файлы из буфера/перетаскивания — во вложения карточки; картинки — ещё и в текст. */
  function uploadFiles(files: File[], at?: number): boolean {
    const upload = live.uploader()
    if (!files.length || !upload) return false
    void (async () => {
      for (const file of files) {
        const id = await upload(file)
        if (id && editor) {
          const image = { type: 'image', attrs: { attachmentId: id, alt: null } }
          if (at !== undefined) editor.chain().focus().insertContentAt(at, image).run()
          else editor.chain().focus().insertContent(image).run()
        }
      }
    })()
    return true
  }

  const submit = () => {
    if (!editor || busy) return
    const doc = editor.getJSON() as RichTextDoc
    void onSubmit(isEmptyDoc(doc) ? null : doc)
  }
  useEffect(() => {
    live.onSubmit(submit)
  })

  const applyLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (isAllowedUrl(url))
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    else return
    setLinkOpen(false)
    setLinkUrl('')
  }

  return (
    <div className="grid gap-2">
      <div className="focus-within:ring-ring rounded-md border focus-within:ring-[3px]">
        {editor && <Toolbar editor={editor} onLink={() => setLinkOpen((open) => !open)} />}
        {linkOpen && (
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Input
              aria-label={t('richText.linkUrl')}
              placeholder="https://"
              value={linkUrl}
              autoFocus
              // Esc закрывает поле ссылки и возвращает в текст — окно карточки этот Esc не перехватывает
              data-own-escape
              className="h-8"
              aria-invalid={!!linkUrl.trim() && !isAllowedUrl(linkUrl)}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyLink()
                }
                if (event.key === 'Escape') {
                  setLinkOpen(false)
                  editor?.commands.focus()
                }
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={applyLink}>
              {t('richText.applyLink')}
            </Button>
          </div>
        )}
        <div className="relative">
          {empty && placeholder && (
            <span className="text-muted-foreground pointer-events-none absolute top-2 left-3 text-sm">
              {placeholder}
            </span>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={submit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('actions.cancel')}
          </Button>
        )}
        <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
          {t('richText.hint')}
        </span>
      </div>
    </div>
  )
}

/**
 * Связь редактора (создаётся один раз) с актуальными props: имена упомянутых, загрузчик файлов,
 * «сохранить». Обработчики Tiptap читают их отсюда, а не из замыкания первого рендера.
 */
class EditorBridge {
  private known: Record<string, string>
  private upload: RichTextEditorProps['onUpload']
  private submitHandler: () => void = () => {}

  constructor(names: Record<string, string>, upload: RichTextEditorProps['onUpload']) {
    this.known = { ...names }
    this.upload = upload
  }

  update(names: Record<string, string>, upload: RichTextEditorProps['onUpload']) {
    this.known = { ...this.known, ...names }
    this.upload = upload
  }

  remember(candidates: MentionCandidate[]) {
    for (const candidate of candidates) this.known[candidate.id] = candidate.name
  }

  names() {
    return this.known
  }

  uploader() {
    return this.upload
  }

  onSubmit(handler: () => void) {
    this.submitHandler = handler
  }

  submit() {
    this.submitHandler()
  }
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const { t } = useTranslation()
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      task: editor.isActive('taskList'),
      quote: editor.isActive('blockquote'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link'),
    }),
  })
  const chain = () => editor.chain().focus()

  const buttons: [keyof typeof state, ReactNode, () => void][] = [
    ['bold', <Bold />, () => chain().toggleBold().run()],
    ['italic', <Italic />, () => chain().toggleItalic().run()],
    ['strike', <Strikethrough />, () => chain().toggleStrike().run()],
    ['code', <Code />, () => chain().toggleCode().run()],
    ['h2', <Heading2 />, () => chain().toggleHeading({ level: 2 }).run()],
    ['h3', <Heading3 />, () => chain().toggleHeading({ level: 3 }).run()],
    ['bullet', <List />, () => chain().toggleBulletList().run()],
    ['ordered', <ListOrdered />, () => chain().toggleOrderedList().run()],
    ['task', <ListChecks />, () => chain().toggleTaskList().run()],
    ['quote', <Quote />, () => chain().toggleBlockquote().run()],
    ['codeBlock', <SquareCode />, () => chain().toggleCodeBlock().run()],
    ['link', <Link2 />, onLink],
  ]

  return (
    <div
      role="toolbar"
      aria-label={t('richText.toolbar')}
      className="flex flex-wrap gap-0.5 border-b p-1"
    >
      {buttons.map(([key, icon, run]) => (
        <Hint key={key} label={t(`richText.tools.${key}`)}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('size-7', state[key] && 'bg-accent')}
            aria-label={t(`richText.tools.${key}`)}
            aria-pressed={state[key]}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
          >
            {icon}
          </Button>
        </Hint>
      ))}
    </div>
  )
}

/** Всплывающий список подсказки @ — без сторонних библиотек позиционирования. */
function mentionPopup() {
  let renderer: ReactRenderer<MentionListHandle> | null = null

  const place = (props: SuggestionProps<MentionCandidate>) => {
    const rect = props.clientRect?.()
    if (!renderer || !rect) return
    const element = renderer.element as HTMLElement
    Object.assign(element.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.bottom + 4}px`,
      zIndex: '60',
    })
  }

  const close = () => {
    renderer?.element.remove()
    renderer?.destroy()
    renderer = null
    setOpenMentionPopup(null)
  }

  return {
    onStart: (props: SuggestionProps<MentionCandidate>) => {
      renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
      const element = renderer.element as HTMLElement
      // Список — вне окна: модальное окно отключает указатель у всего вне себя, щелчок по списку — не «мимо окна»
      element.setAttribute(RICH_TEXT_POPUP_ATTRIBUTE, '')
      element.style.pointerEvents = 'auto'
      document.body.appendChild(element)
      setOpenMentionPopup(close)
      place(props)
    },
    onUpdate: (props: SuggestionProps<MentionCandidate>) => {
      renderer?.updateProps(props)
      place(props)
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (event.key === 'Escape') {
        close()
        return true
      }
      return renderer?.ref?.onKeyDown(event) ?? false
    },
    onExit: close,
  }
}
