import { mergeAttributes, type AnyExtension } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Mention from '@tiptap/extension-mention'
import StarterKit from '@tiptap/starter-kit'
import type { SuggestionOptions } from '@tiptap/suggestion'
import type { MentionCandidate } from './doc'

/** Разрешены только http, https и mailto — как и на сервере. */
export function isAllowedUrl(url: string): boolean {
  return /^(https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(url.trim())
}

/** Адрес картинки-вложения (только через приложение, с проверкой доступа). */
export function attachmentImageUrl(attachmentId: string): string {
  return `/api/v1/attachments/${attachmentId}?inline=1`
}

/**
 * Картинка в тексте — только вложение карточки: в документе хранится id вложения, адрес строит клиент.
 * Вставленные из буфера HTML-картинки с чужих сайтов не превращаются в узлы (parseHTML пустой).
 */
const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      attachmentId: { default: null, renderHTML: () => ({}) },
      alt: { default: null },
    }
  },
  parseHTML() {
    return []
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: attachmentImageUrl(String(node.attrs.attachmentId)),
        loading: 'lazy',
      }),
    ]
  },
})

export interface ExtensionOptions {
  placeholderNames: () => Record<string, string>
  /** Подсказка @ (только в редакторе). */
  suggestion?: Omit<SuggestionOptions<MentionCandidate>, 'editor'>
}

/**
 * Набор расширений — ровно белый список сервера (RichTextDocument): заголовки 1–3, жирный, курсив,
 * зачёркнутый, код, ссылки, списки, чекбоксы, цитаты, блоки кода, упоминания, картинки-вложения.
 * Markdown-сокращения (# , - , 1. , [ ] , > , ```) работают через input rules этих расширений.
 */
export function buildExtensions({
  placeholderNames,
  suggestion,
}: ExtensionOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
        isAllowedUri: (url) => isAllowedUrl(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank', class: null },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // В документе — только id: имя берётся из справочника при показе (переименование не ломает текст)
    Mention.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          label: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
        }
      },
    }).configure({
      HTMLAttributes: { class: 'mention' },
      renderText: ({ node }) => `@${placeholderNames()[String(node.attrs.id)] ?? '…'}`,
      renderHTML: ({ options, node }) => [
        'span',
        mergeAttributes(options.HTMLAttributes, { 'data-id': node.attrs.id }),
        `@${placeholderNames()[String(node.attrs.id)] ?? '…'}`,
      ],
      ...(suggestion ? { suggestion } : {}),
    }),
    AttachmentImage,
  ]
}
