import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { api } from '@/shared/api/client'
import type { RichTextDoc, RichTextNode } from '@/shared/components/rich-text/doc'
import type { Attachment, CardDetail, Comment } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const doc = (...inline: RichTextNode[]): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: inline }],
})

const comment = (overrides: Partial<Comment> = {}): Comment => ({
  id: 'cm1',
  author: { id: 'me', name: 'Анна', status: 'active' },
  body: doc({ type: 'text', text: 'Первый комментарий' }),
  created_at: '2026-10-01T09:00:00.000000Z',
  edited_at: null,
  deleted_at: null,
  permissions: { modify: true },
  ...overrides,
})

const attachment = (overrides: Partial<Attachment>): Attachment => ({
  id: 'a1',
  name: 'file.pdf',
  mime: null,
  size: 2048,
  kind: 'file',
  url: '/files/a1',
  uploaded_by: { id: 'me', name: 'Анна' },
  created_at: '2026-10-01T09:00:00.000000Z',
  permissions: { delete: true },
  ...overrides,
})

/** Карточка DEV-1 и запись изменяющих запросов (ответ — карточка). */
function serve(card: CardDetail, comments: Comment[] = []) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const record =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const type = request.headers.get('content-type') ?? ''
      const body = type.includes('json') ? await request.json() : null
      calls.push({ method, path: new URL(request.url).pathname, body })
      return HttpResponse.json({ data: card })
    }
  server.use(
    http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: card })),
    http.get('*/api/v1/cards/DEV-1/comments', () =>
      HttpResponse.json({ data: comments, users: { u2: 'Вера' } }),
    ),
    http.patch('*/api/v1/cards/DEV-1', record('PATCH')),
    http.post('*/api/v1/cards/DEV-1/comments', record('POST')),
    http.patch('*/api/v1/comments/:id', record('PATCH')),
    http.delete('*/api/v1/comments/:id', record('DELETE')),
    http.post('*/api/v1/cards/DEV-1/checklists', record('POST')),
    http.post('*/api/v1/checklists/:id/items', record('POST')),
    http.patch('*/api/v1/checklist-items/:id', record('PATCH')),
    http.post('*/api/v1/checklist-items/:id/move', record('POST')),
    http.post('*/api/v1/cards/DEV-1/links', record('POST')),
    http.delete('*/api/v1/card-links/:id', record('DELETE')),
    http.delete('*/api/v1/attachments/:id', record('DELETE')),
  )
  // multipart из jsdom MSW разобрать не может (FormData jsdom ≠ FormData Node) — загрузку подменяем на уровне клиента
  const post = api.post.bind(api)
  vi.spyOn(api, 'post').mockImplementation((url: string, data?: unknown, config?: object) => {
    if (url.endsWith('/attachments') && data instanceof FormData) {
      const name = (data.get('file') as File).name
      calls.push({ method: 'UPLOAD', path: url, body: name })
      return Promise.resolve({ data: { data: attachment({ name }) } })
    }
    return post(url, data, config)
  })
  return calls
}

afterEach(() => vi.restoreAllMocks())

describe('Карточка: описание, комментарии, чек-листы, ссылки, файлы', () => {
  beforeEach(() => {
    signedInAs(makeUser({ id: 'me', name: 'Анна', role: 'member' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/cards/DEV-1/history', () => HttpResponse.json(makeCardHistory())),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
      http.get('*/api/v1/spaces/DEV/members', () => HttpResponse.json({ data: [] })),
      http.get('*/api/v1/spaces/DEV/labels', () => HttpResponse.json({ data: [] })),
    )
  })

  it('описание показывается визуально, упоминание — с именем; сохраняется документом', async () => {
    const description = doc(
      { type: 'text', text: 'Проверить с ' },
      { type: 'mention', attrs: { id: 'u2', label: null, mentionSuggestionChar: '@' } },
    )
    const calls = serve(makeCardDetail({ description, mentioned_users: { u2: 'Вера' } }))
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    const section = within(panel).getByRole('region', { name: 'Описание' })
    expect(await within(section).findByText('@Вера')).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'Изменить описание' }))
    expect(
      await within(section).findByRole('toolbar', { name: 'Форматирование' }),
    ).toBeInTheDocument()
    // Значки панели — с подсказкой (U-4 UX-ревью UI-1a)
    await userEvent.hover(within(section).getByRole('button', { name: 'Жирный' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Жирный')
    await userEvent.click(within(section).getByRole('button', { name: 'Сохранить описание' }))

    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].body).toEqual({ description })
  })

  it('комментарии: удалённый — с пометкой; свой — удалить после подтверждения', async () => {
    const calls = serve(makeCardDetail(), [
      comment(),
      comment({
        id: 'cm2',
        body: null,
        deleted_at: '2026-10-02T00:00:00Z',
        permissions: { modify: false },
      }),
      comment({
        id: 'cm3',
        author: { id: 'u2', name: 'Вера', status: 'active' },
        edited_at: '2026-10-03T00:00:00Z',
        permissions: { modify: false },
      }),
    ])
    renderApp('/cards/DEV-1')
    // Комментарии — вкладка внизу окна, открыта по умолчанию
    const section = within(await screen.findByRole('dialog')).getByRole('tabpanel', {
      name: 'Комментарии',
    })

    expect(await within(section).findByText('Комментарий удалён')).toBeInTheDocument()
    expect(within(section).getByText('(изменено)')).toBeInTheDocument()
    const mine = within(section).getAllByRole('listitem', { name: 'Комментарий: Анна' })[0]
    expect(await within(mine).findByText('Первый комментарий')).toBeInTheDocument()

    await userEvent.click(within(mine).getByRole('button', { name: 'Удалить' }))
    const confirm = await screen.findByRole('dialog', { name: 'Удалить комментарий?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([{ method: 'DELETE', path: '/api/v1/comments/cm1', body: null }]),
    )
  })

  it('commenter видит редактор комментария, но не правит чек-листы и ссылки', async () => {
    serve(
      makeCardDetail({
        permissions: { edit: false, comment: true, restricted: false, delete: false },
        checklists: [
          { id: 'ch1', title: 'Релиз', items: [{ id: 'i1', text: 'Тесты', is_done: true }] },
        ],
        links: [{ id: 'l1', url: 'https://figma.com/x', title: 'Макет' }],
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(
      await within(panel).findByRole('textbox', { name: 'Новый комментарий' }),
    ).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Тесты' })).toBeDisabled()
    expect(within(panel).getByText('1/1')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'Макет' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    )
    expect(within(panel).queryByLabelText('Адрес ссылки')).not.toBeInTheDocument()
    expect(within(panel).queryByLabelText('Название нового чек-листа')).not.toBeInTheDocument()
  })

  it('чек-листы: создать, добавить пункт, отметить, переставить с клавиатуры', async () => {
    const calls = serve(
      makeCardDetail({
        checklists: [
          {
            id: 'ch1',
            title: 'Релиз',
            items: [
              { id: 'i1', text: 'Тесты', is_done: false },
              { id: 'i2', text: 'Миграции', is_done: false },
            ],
          },
        ],
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Новый чек-лист — кнопкой внизу секции; после создания форма закрывается
    await userEvent.click(within(panel).getByRole('button', { name: 'Чек-лист' }))
    await userEvent.type(
      within(panel).getByLabelText('Название нового чек-листа'),
      'После релиза{Enter}',
    )
    await vi.waitFor(() =>
      expect(within(panel).queryByLabelText('Название нового чек-листа')).not.toBeInTheDocument(),
    )
    await userEvent.type(
      within(panel).getByLabelText('Новый пункт в «Релиз»'),
      'Документация{Enter}',
    )
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Тесты' }))
    // Ручка перестановки — по-русски для экранного диктора (U-2 UX-ревью UI-1a)
    const grip = within(panel).getByRole('button', { name: 'Переставить «Тесты» (Alt+↑/↓)' })
    expect(grip).toHaveAttribute('aria-roledescription', 'пункт чек-листа')
    expect(grip).toHaveAccessibleDescription(/^Чтобы переставить пункт, нажмите пробел/)
    grip.focus()
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}')

    await vi.waitFor(() =>
      expect(calls.map((c) => [c.path, c.body])).toEqual([
        ['/api/v1/cards/DEV-1/checklists', { title: 'После релиза' }],
        ['/api/v1/checklists/ch1/items', { text: 'Документация' }],
        ['/api/v1/checklist-items/i1', { is_done: true }],
        ['/api/v1/checklist-items/i1/move', { after_id: 'i2', before_id: null }],
      ]),
    )
  })

  it('ссылки: только http и https', async () => {
    const calls = serve(makeCardDetail())
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    // Ссылок нет — секции нет; новая — пунктом «+», фокус сразу в поле адреса
    expect(within(panel).queryByRole('region', { name: 'Ссылки' })).not.toBeInTheDocument()
    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить в карточку' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ссылка' }))
    await vi.waitFor(() => expect(within(panel).getByLabelText('Адрес ссылки')).toHaveFocus())

    await userEvent.type(within(panel).getByLabelText('Адрес ссылки'), 'javascript:alert(1)')
    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить' }))
    expect(await within(panel).findByText(/должна начинаться с http/)).toBeInTheDocument()

    await userEvent.clear(within(panel).getByLabelText('Адрес ссылки'))
    await userEvent.type(within(panel).getByLabelText('Адрес ссылки'), 'https://figma.com/file')
    await userEvent.type(within(panel).getByLabelText('Название (необязательно)'), 'Макет')
    await userEvent.click(within(panel).getByRole('button', { name: 'Добавить' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'POST',
          path: '/api/v1/cards/DEV-1/links',
          body: { url: 'https://figma.com/file', title: 'Макет' },
        },
      ]),
    )
  })

  it('файлы: превью картинки, видеоплеер, скачивание; загрузка с проверкой размера', async () => {
    const calls = serve(
      makeCardDetail({
        attachments: [
          attachment({
            id: 'img',
            name: 'screen.png',
            kind: 'image',
            mime: 'image/png',
            url: '/files/img',
          }),
          attachment({
            id: 'vid',
            name: 'demo.mp4',
            kind: 'video',
            mime: 'video/mp4',
            url: '/files/vid',
          }),
          attachment({
            id: 'mov',
            name: 'screen.mov',
            kind: 'video',
            mime: 'video/quicktime',
            url: '/files/mov',
          }),
          attachment({
            id: 'doc',
            name: 'spec.pdf',
            size: 3 * 1024 * 1024,
            url: '/files/doc',
            permissions: { delete: false },
          }),
        ],
      }),
    )
    renderApp('/cards/DEV-1')
    const section = within(await screen.findByRole('dialog')).getByRole('region', { name: 'Файлы' })

    expect(within(section).getByRole('img', { name: 'screen.png' })).toHaveAttribute(
      'src',
      '/files/img',
    )
    expect(within(section).getByLabelText('demo.mp4')).toHaveAttribute('src', '/files/vid')
    expect(within(section).getByLabelText('screen.mov')).toHaveAttribute('src', '/files/mov')
    expect(within(section).getByRole('link', { name: 'spec.pdf' })).toHaveAttribute(
      'href',
      '/files/doc',
    )
    // «Скачать» — всегда скачиванием; ссылку на файл можно скопировать (UI-1b)
    expect(within(section).getByRole('link', { name: 'Скачать spec.pdf' })).toHaveAttribute(
      'href',
      '/files/doc?download=1',
    )
    // В jsdom буфера обмена нет — как у страницы не на https: не «скопирована», а объяснение
    await userEvent.click(
      within(section).getByRole('button', { name: 'Скопировать ссылку на spec.pdf' }),
    )
    expect(
      await screen.findByText('Не удалось скопировать: браузер не дал доступа к буферу обмена.'),
    ).toBeInTheDocument()
    // setup() даёт буфер обмена
    await userEvent
      .setup()
      .click(within(section).getByRole('button', { name: 'Скопировать ссылку на spec.pdf' }))
    expect(await screen.findByText('Ссылка на файл скопирована')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/files/doc`)
    expect(within(section).getByText('3 МБ')).toBeInTheDocument()
    expect(
      within(section).queryByRole('button', { name: 'Удалить spec.pdf' }),
    ).not.toBeInTheDocument()

    // Браузер не смог воспроизвести видео — сообщение и «Скачать» вместо плеера
    fireEvent.error(within(section).getByLabelText('screen.mov'))
    expect(within(section).queryByLabelText('screen.mov')).not.toBeInTheDocument()
    expect(within(section).getByRole('status')).toHaveTextContent(
      'Браузер не может воспроизвести это видео',
    )
    expect(within(section).getByRole('link', { name: 'Скачать' })).toHaveAttribute(
      'href',
      '/files/mov?download=1',
    )
    // Загрузился только звук (кодек кадра неизвестен) — тоже фолбэк
    const mp4 = within(section).getByLabelText('demo.mp4')
    Object.defineProperty(mp4, 'videoWidth', { value: 0 })
    fireEvent.loadedMetadata(mp4)
    expect(within(section).queryByLabelText('demo.mp4')).not.toBeInTheDocument()

    // Просмотр в полный размер
    await userEvent.click(within(section).getByRole('button', { name: 'Открыть screen.png' }))
    expect(await screen.findByRole('dialog', { name: 'screen.png' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    // Файлы выбирает окно (пункт «+», кнопка секции, перетаскивание)
    const input = screen.getByLabelText('Выбрать файлы')
    const big = new File(['x'], 'huge.zip')
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 })
    await userEvent.upload(input, [new File(['data'], 'notes.txt', { type: 'text/plain' }), big])

    expect(
      await screen.findByText('«huge.zip» больше 100 МБ — такой файл не загрузить'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Файл «notes.txt» приложен')).toBeInTheDocument()
    expect(calls).toEqual([
      { method: 'UPLOAD', path: '/cards/DEV-1/attachments', body: 'notes.txt' },
    ])

    await userEvent.click(within(section).getByRole('button', { name: 'Удалить screen.png' }))
    await vi.waitFor(() =>
      expect(calls.at(-1)).toEqual({
        method: 'DELETE',
        path: '/api/v1/attachments/img',
        body: null,
      }),
    )
  })
})
