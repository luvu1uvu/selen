import { createRef } from 'react'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isEmptyDoc, type RichTextDoc } from './doc'
import { attachmentImageUrl, isAllowedUrl } from './extensions'
import { MentionList, type MentionListHandle } from './MentionList'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'

const paragraph = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('документ визуального редактора', () => {
  it('isEmptyDoc: пустые абзацы и пробелы — пусто; текст, упоминание, картинка — нет', () => {
    expect(isEmptyDoc(null)).toBe(true)
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true)
    expect(isEmptyDoc(paragraph('   '))).toBe(true)
    expect(isEmptyDoc(paragraph('текст'))).toBe(false)
    expect(
      isEmptyDoc({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1' } }] }],
      }),
    ).toBe(false)
    expect(
      isEmptyDoc({ type: 'doc', content: [{ type: 'image', attrs: { attachmentId: 'a1' } }] }),
    ).toBe(false)
  })

  it('ссылки — только http, https и mailto (как на сервере)', () => {
    expect(isAllowedUrl('https://figma.com/file')).toBe(true)
    expect(isAllowedUrl('http://intranet/doc')).toBe(true)
    expect(isAllowedUrl('mailto:a@b.ru')).toBe(true)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('data:text/html,<b>')).toBe(false)
    expect(isAllowedUrl('https://a.ru/ x')).toBe(false)
    expect(attachmentImageUrl('a1')).toBe('/files/a1')
  })
})

describe('просмотр', () => {
  it('рисует форматирование и упоминание с именем из справочника; картинку — по id вложения', () => {
    const doc: RichTextDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Заголовок' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ' },
            { type: 'mention', attrs: { id: 'u1', label: null, mentionSuggestionChar: '@' } },
            { type: 'text', text: ' ' },
            {
              type: 'text',
              text: 'ссылка',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://a.ru',
                    target: '_blank',
                    rel: 'noopener noreferrer nofollow',
                  },
                },
              ],
            },
          ],
        },
        { type: 'image', attrs: { attachmentId: 'a1', alt: 'схема' } },
      ],
    }
    render(<RichTextView doc={doc} names={{ u1: 'Вера' }} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Заголовок' })).toBeInTheDocument()
    expect(screen.getByText('жирный').tagName).toBe('STRONG')
    expect(screen.getByText('@Вера')).toHaveAttribute('data-id', 'u1')
    expect(screen.getByRole('link', { name: 'ссылка' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    )
    expect(screen.getByRole('img', { name: 'схема' })).toHaveAttribute('src', '/files/a1')
  })
})

describe('редактор', () => {
  function renderEditor(overrides: Partial<Parameters<typeof RichTextEditor>[0]> = {}) {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(
      <RichTextEditor
        initial={paragraph('Черновик')}
        names={{}}
        loadMentionable={async () => [{ id: 'u1', name: 'Вера' }]}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitLabel="Сохранить"
        label="Описание"
        placeholder="Добавьте описание"
        {...overrides}
      />,
    )
    return { onSubmit, onCancel }
  }

  it('сохраняет документ кнопкой и по Ctrl+Enter; отмена', async () => {
    const { onSubmit, onCancel } = renderEditor()

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenLastCalledWith(paragraph('Черновик'))

    screen.getByRole('textbox', { name: 'Описание' }).focus()
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(onSubmit).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('пустой документ уходит как null; подсказка видна, пока пусто', async () => {
    const { onSubmit } = renderEditor({ initial: null })

    expect(screen.getByText('Добавьте описание')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSubmit).toHaveBeenCalledWith(null)
  })

  it('панель форматирования — одна остановка Tab, по кнопкам — стрелки, Home и End (U-4 UX-ревью UI-1a)', async () => {
    renderEditor()
    const toolbar = screen.getByRole('toolbar', { name: 'Форматирование' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.filter((button) => button.tabIndex === 0)).toEqual([buttons[0]])

    buttons[0].focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Курсив' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(buttons.at(-1)).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(buttons[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(buttons.at(-1)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(buttons[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    // Tab — из панели сразу в текст; вернулись — на ту кнопку, где были
    await userEvent.tab()
    expect(screen.getByRole('textbox', { name: 'Описание' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Курсив' })).toHaveFocus()
  })

  it('панель форматирования и ссылка: недопустимый адрес не применяется', async () => {
    renderEditor()

    const bold = screen.getByRole('button', { name: 'Жирный' })
    expect(bold).toHaveAttribute('aria-pressed', 'false')
    for (const name of [
      'Курсив',
      'Заголовок',
      'Маркированный список',
      'Список задач',
      'Цитата',
      'Блок кода',
    ]) {
      await userEvent.click(screen.getByRole('button', { name }))
    }

    await userEvent.click(screen.getByRole('button', { name: 'Ссылка' }))
    const url = screen.getByRole('textbox', { name: 'Адрес ссылки' })
    await userEvent.type(url, 'javascript:alert(1)')
    expect(url).toHaveAttribute('aria-invalid', 'true')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Адрес ссылки' })).toBeInTheDocument()

    await userEvent.clear(url)
    await userEvent.type(url, 'https://a.ru{Enter}')
    expect(screen.queryByRole('textbox', { name: 'Адрес ссылки' })).not.toBeInTheDocument()
  })
})

describe('список упоминаний', () => {
  it('стрелки выбирают, Enter вставляет только id (без имени)', () => {
    const command = vi.fn()
    const ref = createRef<MentionListHandle>()
    const items = [
      { id: 'u1', name: 'Вера' },
      { id: 'u2', name: 'Глеб' },
    ]
    render(<MentionList ref={ref} items={items} command={command} />)

    act(() => {
      ref.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    expect(screen.getByRole('option', { name: 'Глеб' })).toHaveAttribute('aria-selected', 'true')
    act(() => {
      ref.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    })
    act(() => {
      ref.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(command).toHaveBeenCalledWith({ id: 'u1', label: null })
    expect(ref.current!.onKeyDown(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false)
  })

  it('никого не найдено', () => {
    render(<MentionList items={[]} command={vi.fn()} />)
    expect(screen.getByText('Никого не найдено')).toBeInTheDocument()
  })
})
