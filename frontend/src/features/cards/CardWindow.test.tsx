import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { api } from '@/shared/api/client'
import type { Attachment, BoardSummary, CardDetail } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const boards: BoardSummary[] = [
  {
    id: 'board-1',
    space_id: 'space-1',
    row_id: 'row-1',
    name: 'Продукт',
    description: null,
    position: 'a0',
    archived_at: null,
  },
  {
    id: 'board-2',
    space_id: 'space-1',
    row_id: 'row-1',
    name: 'Релизы',
    description: null,
    position: 'a1',
    archived_at: null,
  },
]

const releases = makeBoardDetail({
  id: 'board-2',
  name: 'Релизы',
  columns: [
    { id: 'r-todo', parent_id: null, name: 'План', category: 'queue', position: 'a0' },
    { id: 'r-done', parent_id: null, name: 'Выпущено', category: 'done', position: 'a1' },
  ],
  lanes: [{ id: 'r-main', name: 'Основная', position: 'a0' }],
  cards: [],
})

const readOnly = { edit: false, comment: true, restricted: false, delete: false }

/** Карточка DEV-1: GET отдаёт `card`, PATCH применяет поля. */
function serveCard(card: CardDetail) {
  let current = card
  const patches: unknown[] = []
  server.use(
    http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: current })),
    http.patch('*/api/v1/cards/DEV-1', async ({ request }) => {
      const body = (await request.json()) as Partial<CardDetail>
      patches.push(body)
      current = { ...current, ...body }
      return HttpResponse.json({ data: current })
    }),
  )
  return patches
}

/** Загрузка файла: multipart из jsdom MSW не разбирает — подменяем на уровне клиента (как в CardContent.test). */
function spyUploads() {
  const uploaded: string[] = []
  const post = api.post.bind(api)
  vi.spyOn(api, 'post').mockImplementation((url: string, data?: unknown, config?: object) => {
    if (url.endsWith('/attachments') && data instanceof FormData) {
      const name = (data.get('file') as File).name
      uploaded.push(name)
      const attachment: Attachment = {
        id: 'a1',
        name,
        mime: null,
        size: 4,
        kind: 'file',
        url: '/files/a1',
        opens_in_browser: false,
        uploaded_by: { id: 'me', name: 'Анна' },
        created_at: '2026-10-01T09:00:00.000000Z',
        permissions: { delete: true },
      }
      return Promise.resolve({ data: { data: attachment } })
    }
    return post(url, data, config)
  })
  return uploaded
}

async function openAddMenu(window: HTMLElement) {
  await userEvent.click(within(window).getByRole('button', { name: 'Добавить в карточку' }))
  return screen.findByRole('menu')
}

async function openActions(window: HTMLElement) {
  await userEvent.click(within(window).getByRole('button', { name: /^Действия с карточкой/ }))
  return screen.findByRole('menu')
}

describe('Окно карточки', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member' }))
    window.localStorage.clear()
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/boards/board-2', () => HttpResponse.json({ data: releases })),
      http.get('*/api/v1/spaces/DEV/boards', () => HttpResponse.json({ data: boards })),
      http.get('*/api/v1/cards/DEV-1/history', () => HttpResponse.json(makeCardHistory())),
      http.get('*/api/v1/cards/DEV-1/comments', () => HttpResponse.json({ data: [], users: {} })),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
    )
  })

  describe('шапка', () => {
    it('название, номер, заказчик; «Создана» и «Перемещена» — точное время в подсказке', async () => {
      serveCard(
        makeCardDetail({
          created_at: '2026-10-01T09:00:00.000000Z',
          moved_at: '2026-10-02T10:30:00.000000Z',
        }),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog', { name: 'Первая' })

      expect(within(window).getByRole('textbox', { name: 'Название' })).toHaveValue('Первая')
      expect(
        within(window).getByRole('button', { name: 'DEV-1. Скопировать ссылку на карточку' }),
      ).toBeInTheDocument()
      expect(within(window).getByText('Заказчик')).toBeInTheDocument()
      const created = within(window).getByText(/^Создана \d+ /)
      expect(within(window).getByText(/^Перемещена \d+ /)).toBeInTheDocument()

      created.focus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('1 окт. 2026 г., 12:00, Борис')
    })

    it('не перемещали — только «Создана»; номер копирует ссылку на карточку', async () => {
      // setup() даёт буфер обмена (в jsdom его нет — копирование сообщило бы об ошибке)
      const user = userEvent.setup()
      serveCard(makeCardDetail({ moved_at: null }))
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      expect(within(window).queryByText(/^Перемещена/)).not.toBeInTheDocument()
      await user.click(within(window).getByRole('button', { name: /^DEV-1\./ }))
      expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument()
      expect(await navigator.clipboard.readText()).toBe(`${location.origin}/cards/DEV-1`)
    })

    it('название правится на месте: Enter сохраняет, Esc отменяет правку и не закрывает окно', async () => {
      const patches = serveCard(makeCardDetail())
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')
      const title = within(window).getByRole('textbox', { name: 'Название' })

      await userEvent.clear(title)
      await userEvent.type(title, 'Новое название{Enter}')
      expect(await screen.findByText('Сохранено')).toBeInTheDocument()
      expect(patches).toEqual([{ title: 'Новое название' }])

      await userEvent.type(title, ' ещё')
      await userEvent.keyboard('{Escape}')
      expect(title).toHaveValue('Новое название')
      expect(title).not.toHaveFocus()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/cards/DEV-1')
      expect(patches).toHaveLength(1)
    })

    it('без права правки название — заголовок, а не поле', async () => {
      serveCard(makeCardDetail({ permissions: readOnly }))
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog', { name: 'Первая' })

      expect(within(window).queryByRole('textbox', { name: 'Название' })).not.toBeInTheDocument()
      expect(within(window).getByRole('heading', { name: 'Первая' })).toBeInTheDocument()
    })
  })

  describe('закрытие', () => {
    it('открытое с доски закрывается шагом назад: Esc, «Вперёд» открывает снова, фокус — на плитке', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')

      const tile = await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' })
      tile.focus()
      await userEvent.keyboard('{Enter}')
      const window = await screen.findByRole('dialog', { name: 'Первая' })
      expect(router.state.location.pathname).toBe('/cards/DEV-1')
      // Фокус — на самом окне, а не в поле названия
      expect(window).toHaveFocus()

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Открыть DEV-1: Первая' })).toHaveFocus()
      expect(router.state.historyAction).toBe('POP')

      await router.navigate(1)
      expect(await screen.findByRole('dialog', { name: 'Первая' })).toBeInTheDocument()
    })

    it('открытое по прямой ссылке закрывается заменой адреса на доску', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      await userEvent.click(within(window).getByRole('button', { name: 'Закрыть' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('«Назад» браузера закрывает окно', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      await screen.findByRole('dialog')

      await router.navigate(-1)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(router.state.location.pathname).toBe('/boards/board-1')
    })
    it('переход к связанной карточке: закрытие возвращает к доске одним действием, «Назад» — к предыдущей', async () => {
      serveCard(
        makeCardDetail({
          relations: {
            parents: [
              {
                id: 'r1',
                card: {
                  hidden: false,
                  id: 'c2',
                  key: 'DEV-2',
                  title: 'Вторая',
                  category: 'queue',
                  archived: false,
                },
              },
            ],
            children: [],
            progress: null,
          },
        }),
      )
      server.use(
        http.get('*/api/v1/cards/DEV-2', () =>
          HttpResponse.json({ data: makeCardDetail({ id: 'c2', key: 'DEV-2', title: 'Вторая' }) }),
        ),
        http.get('*/api/v1/cards/DEV-2/comments', () => HttpResponse.json({ data: [], users: {} })),
      )
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      const first = await screen.findByRole('dialog', { name: 'Первая' })

      await userEvent.click(within(first).getByRole('link', { name: 'DEV-2' }))
      const second = await screen.findByRole('dialog', { name: 'Вторая' })
      // Тело окна пересоздано — фокус на окне, а не в body
      await waitFor(() => expect(second).toHaveFocus())

      await router.navigate(-1)
      expect(await screen.findByRole('dialog', { name: 'Первая' })).toBeInTheDocument()
      await router.navigate(1)
      await screen.findByRole('dialog', { name: 'Вторая' })

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('по прямой ссылке переход к связанной карточке заменяет адрес — закрытие ведёт на доску', async () => {
      serveCard(
        makeCardDetail({
          relations: {
            parents: [
              {
                id: 'r1',
                card: {
                  hidden: false,
                  id: 'c2',
                  key: 'DEV-2',
                  title: 'Вторая',
                  category: 'queue',
                  archived: false,
                },
              },
            ],
            children: [],
            progress: null,
          },
        }),
      )
      server.use(
        http.get('*/api/v1/cards/DEV-2', () =>
          HttpResponse.json({ data: makeCardDetail({ id: 'c2', key: 'DEV-2', title: 'Вторая' }) }),
        ),
        http.get('*/api/v1/cards/DEV-2/comments', () => HttpResponse.json({ data: [], users: {} })),
      )
      const { router } = renderApp('/cards/DEV-1')
      const first = await screen.findByRole('dialog', { name: 'Первая' })

      await userEvent.click(within(first).getByRole('link', { name: 'DEV-2' }))
      await screen.findByRole('dialog', { name: 'Вторая' })
      expect(router.state.historyAction).toBe('REPLACE')

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
    })

    it('двойной Esc не уводит дальше доски', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      const window = await screen.findByRole('dialog')

      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: 'Escape' })
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(router.state.location.pathname).toBe('/boards/board-1')
    })
  })

  describe('несохранённый текст', () => {
    it('первый Esc выводит из поля, следующий — вопрос «Закрыть без сохранения?»; то же «Назад»', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      const window = await screen.findByRole('dialog', { name: 'Первая' })

      // Чек-лист без названия: текст в поле формы
      await userEvent.click(
        await openAddMenu(window).then((menu) => within(menu).getByText('Чек-лист')),
      )
      const field = await within(window).findByLabelText('Название нового чек-листа')
      await waitFor(() => expect(field).toHaveFocus())
      await userEvent.type(field, 'Черновик')

      await userEvent.keyboard('{Escape}')
      expect(field).not.toHaveFocus()
      expect(field).toHaveValue('Черновик')
      expect(
        screen.queryByRole('dialog', { name: 'Закрыть без сохранения?' }),
      ).not.toBeInTheDocument()

      await userEvent.keyboard('{Escape}')
      const confirm = await screen.findByRole('dialog', { name: 'Закрыть без сохранения?' })
      await userEvent.click(
        within(confirm).getByRole('button', { name: 'Продолжить редактирование' }),
      )
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Закрыть без сохранения?' }),
        ).not.toBeInTheDocument(),
      )
      expect(router.state.location.pathname).toBe('/cards/DEV-1')
      expect(field).toHaveValue('Черновик')
      // Курсор снова в поле с несохранённым текстом (просьба PM)
      await waitFor(() => expect(field).toHaveFocus())

      void router.navigate(-1)
      const again = await screen.findByRole('dialog', { name: 'Закрыть без сохранения?' })
      await userEvent.click(within(again).getByRole('button', { name: 'Закрыть без сохранения' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('две формы «+» сразу и свёрнутая секция не теряют начатый текст', async () => {
      serveCard(
        makeCardDetail({
          checklists: [{ id: 'ch1', title: 'Релиз', items: [] }],
        }),
      )
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      // Причина блокировки, потом ещё и ссылка — причина на месте
      await userEvent.click(
        within(await openAddMenu(window)).getByRole('menuitem', { name: 'Блокировка' }),
      )
      await userEvent.type(
        await within(window).findByLabelText('Причина блокировки'),
        'Ждём доступ',
      )
      await userEvent.click(
        within(await openAddMenu(window)).getByRole('menuitem', { name: 'Ссылка' }),
      )
      expect(await within(window).findByLabelText('Адрес ссылки')).toBeInTheDocument()
      expect(within(window).getByLabelText('Причина блокировки')).toHaveValue('Ждём доступ')

      // Текст нового пункта в свёрнутых «Чек-листах» остаётся
      await userEvent.type(within(window).getByLabelText('Новый пункт в «Релиз»'), 'Проверить')
      await userEvent.click(within(window).getByRole('button', { name: /^Чек-листы/ }))
      expect(within(window).getByLabelText('Новый пункт в «Релиз»')).not.toBeVisible()
      await userEvent.click(within(window).getByRole('button', { name: /^Чек-листы/ }))
      expect(within(window).getByLabelText('Новый пункт в «Релиз»')).toHaveValue('Проверить')

      // Закрытие — с вопросом
      await userEvent.click(within(window).getByRole('button', { name: 'Закрыть' }))
      expect(
        await screen.findByRole('dialog', { name: 'Закрыть без сохранения?' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/cards/DEV-1')
    })

    it('сохранённое название — не «несохранённый текст»; Esc в «План, ч» отменяет правку', async () => {
      const patches = serveCard(makeCardDetail({ estimate_hours: 2 }))
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      const estimate = within(window).getByLabelText('План, ч')
      await userEvent.clear(estimate)
      await userEvent.type(estimate, '5')
      await userEvent.keyboard('{Escape}')
      expect(estimate).toHaveValue('2')
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      const title = within(window).getByRole('textbox', { name: 'Название' })
      await userEvent.type(title, '!')
      await userEvent.click(within(window).getByRole('button', { name: 'Закрыть' }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      expect(
        screen.queryByRole('dialog', { name: 'Закрыть без сохранения?' }),
      ).not.toBeInTheDocument()
      expect(patches).toEqual([{ title: 'Первая!' }])
    })

    it('без текста окно закрывается сразу, без вопроса', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      await userEvent.click(
        await openAddMenu(window).then((menu) => within(menu).getByText('Чек-лист')),
      )
      await within(window).findByLabelText('Название нового чек-листа')
      await userEvent.keyboard('{Escape}{Escape}')

      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      expect(
        screen.queryByRole('dialog', { name: 'Закрыть без сохранения?' }),
      ).not.toBeInTheDocument()
    })
  })

  describe('«+» и «⋯» — только разрешённое', () => {
    it('редактор: «+» — группы «Основное», «Связи», «Остальное» и колонка «Поля»; «⋯» — перенос, архив, ссылка', async () => {
      serveCard(makeCardDetail())
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      const add = await openAddMenu(window)
      expect(
        within(add)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Срок',
        'Метки',
        'План, ч',
        'Чек-лист',
        'Ссылка',
        'Загрузить файл',
        'Родительская карточка',
        'Дочерняя карточка',
        'Блокировка',
        'Создать новое поле',
      ])
      // Как в Kaiten (LATER-97): слева группы системных пунктов, справа — «Поля» (заглушка до этапа 5)
      expect(
        within(add)
          .getAllByRole('group')
          .map((group) => group.getAttribute('aria-label')),
      ).toEqual(['Основное', 'Связи', 'Остальное', 'Поля'])
      const fields = within(add).getByRole('group', { name: 'Поля' })
      expect(within(fields).getByRole('textbox', { name: 'Найти поле' })).toBeDisabled()
      const create = within(fields).getByRole('menuitem', { name: 'Создать новое поле' })
      expect(create).toHaveAttribute('aria-disabled', 'true')
      expect(create).toHaveAccessibleDescription('Пользовательские поля появятся позже')
      await userEvent.keyboard('{Escape}')
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      const actions = await openActions(window)
      expect(
        within(actions)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Переместить…', 'Архивировать', 'Скопировать ссылку'])
    })

    it('комментатор: «+» — только «Загрузить файл», «⋯» — только «Скопировать ссылку»; лупы переноса нет', async () => {
      serveCard(makeCardDetail({ permissions: readOnly }))
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      const add = await openAddMenu(window)
      expect(
        within(add)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Загрузить файл'])
      await userEvent.keyboard('{Escape}')
      const actions = await openActions(window)
      expect(
        within(actions)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual(['Скопировать ссылку'])
      expect(within(window).queryByRole('button', { name: 'Переместить…' })).not.toBeInTheDocument()
    })

    it('ни править, ни комментировать нельзя — «+» нет', async () => {
      serveCard(
        makeCardDetail({
          permissions: { edit: false, comment: false, restricted: false, delete: false },
        }),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      expect(
        within(window).queryByRole('button', { name: 'Добавить в карточку' }),
      ).not.toBeInTheDocument()
    })

    it('срок и метки, пока не заданы, скрыты; «+» показывает строку и сразу открывает выбор (LATER-97)', async () => {
      serveCard(makeCardDetail())
      let labelsBody: unknown
      server.use(
        http.put('*/api/v1/cards/DEV-1/labels', async ({ request }) => {
          labelsBody = await request.json()
          return HttpResponse.json({ data: makeCardDetail() })
        }),
        http.get('*/api/v1/spaces/DEV/labels', () =>
          HttpResponse.json({
            data: [
              { id: 'l1', name: 'Фронтенд', color: '#3b82f6', scope: 'space', archived_at: null },
            ],
          }),
        ),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')
      const main = within(window).getByRole('region', { name: 'Основные параметры' })
      // Открытое меню прячет остальное от диктора (aria-hidden) — строки ищем и в скрытом
      const terms = () =>
        within(main)
          .getAllByRole('term', { hidden: true })
          .map((term) => term.textContent)
      expect(terms()).toEqual(['Расположение', 'Тип', 'Ответственный', 'Участники', 'Срочно'])

      // «+» → «Срок»: строка появилась, фокус — в дате; закрыли без срока — строки снова нет
      await userEvent.click(
        within(await openAddMenu(window)).getByRole('menuitem', { name: 'Срок' }),
      )
      await waitFor(() => expect(screen.getByLabelText('Дата срока')).toHaveFocus())
      expect(terms()).toContain('Срок')
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(terms()).not.toContain('Срок'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // «+» → «Метки»: строка и сразу список меток
      await userEvent.click(
        within(await openAddMenu(window)).getByRole('menuitem', { name: 'Метки' }),
      )
      await waitFor(() => expect(terms()).toContain('Метки'))
      await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Фронтенд' }))
      await waitFor(() => expect(labelsBody).toEqual({ label_ids: ['l1'] }))
    })

    it('архивирует и возвращает из архива; архивная — только для чтения, без «+»', async () => {
      const calls: string[] = []
      serveCard(makeCardDetail())
      server.use(
        http.post('*/api/v1/cards/DEV-1/archive', () => {
          calls.push('archive')
          return HttpResponse.json({
            data: makeCardDetail({ archived_at: '2026-10-02T00:00:00Z' }),
          })
        }),
        http.post('*/api/v1/cards/DEV-1/restore', () => {
          calls.push('restore')
          return HttpResponse.json({ data: makeCardDetail() })
        }),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      await userEvent.click(
        within(await openActions(window)).getByRole('menuitem', { name: 'Архивировать' }),
      )
      expect(await screen.findByText('Карточка архивирована')).toBeInTheDocument()
      expect(within(window).getByText('Карточка в архиве')).toBeInTheDocument()
      expect(within(window).queryByRole('textbox', { name: 'Название' })).not.toBeInTheDocument()
      expect(
        within(window).queryByRole('button', { name: 'Добавить в карточку' }),
      ).not.toBeInTheDocument()

      const actions = await openActions(window)
      expect(
        within(actions).queryByRole('menuitem', { name: 'Переместить…' }),
      ).not.toBeInTheDocument()
      await userEvent.click(within(actions).getByRole('menuitem', { name: 'Вернуть из архива' }))
      expect(await screen.findByText('Карточка восстановлена')).toBeInTheDocument()
      expect(calls).toEqual(['archive', 'restore'])
    })

    it('перемещает на другую доску пространства — из «⋯» и лупой у «Расположения»', async () => {
      let body: unknown
      serveCard(makeCardDetail())
      server.use(
        http.post('*/api/v1/cards/DEV-1/move', async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({
            data: makeCardDetail({ board: { id: 'board-2', name: 'Релизы' } }),
          })
        }),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      await userEvent.click(
        within(await openActions(window)).getByRole('menuitem', { name: 'Переместить…' }),
      )
      let dialog = await screen.findByRole('dialog', { name: 'Переместить DEV-1' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Переместить DEV-1' })).not.toBeInTheDocument(),
      )

      await userEvent.click(within(window).getByRole('button', { name: 'Переместить…' }))
      dialog = await screen.findByRole('dialog', { name: 'Переместить DEV-1' })
      // Колонки текущей доски: подколонки показываются с родителем
      expect(
        await within(dialog).findByRole('option', { name: 'In Progress / Dev' }),
      ).toBeInTheDocument()
      await userEvent.selectOptions(within(dialog).getByLabelText('Доска'), 'board-2')
      expect(await within(dialog).findByRole('option', { name: 'Выпущено' })).toBeInTheDocument()
      await userEvent.selectOptions(within(dialog).getByLabelText('Колонка'), 'r-done')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Переместить' }))

      expect(await screen.findByText('Карточка перемещена')).toBeInTheDocument()
      expect(body).toEqual({ board_id: 'board-2', column_id: 'r-done', lane_id: 'r-main' })
    })

    it('после окна «Переместить» фокус на лупе без подсказки — Esc закрывает окно карточки (LATER-94)', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      const window = await screen.findByRole('dialog', { name: 'Первая' })

      const lupa = within(window).getByRole('button', { name: 'Переместить…' })
      await userEvent.click(lupa)
      await screen.findByRole('dialog', { name: 'Переместить DEV-1' })
      await userEvent.keyboard('{Escape}')
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Переместить DEV-1' })).not.toBeInTheDocument(),
      )
      await waitFor(() => expect(lupa).toHaveFocus())
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
    })

    it('после Esc в меню «⋯» подсказка не открывается — следующий Esc закрывает окно (U-5 UX-ревью)', async () => {
      serveCard(makeCardDetail())
      const { router } = renderApp('/boards/board-1')
      await userEvent.click(await screen.findByRole('button', { name: 'Открыть DEV-1: Первая' }))
      const window = await screen.findByRole('dialog', { name: 'Первая' })

      await openActions(window)
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
      expect(within(window).getByRole('button', { name: /^Действия с карточкой/ })).toHaveFocus()
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
    })

    it('системный администратор удаляет в корзину из «⋯» — окно закрывается, карточку не перезапрашиваем', async () => {
      let deleted = 0
      let fetchedAfterDelete = 0
      server.use(
        http.get('*/api/v1/cards/DEV-1', () => {
          if (deleted) {
            fetchedAfterDelete++
            return HttpResponse.json({ message: 'Не найдено.' }, { status: 404 })
          }
          return HttpResponse.json({
            data: makeCardDetail({
              permissions: { edit: true, comment: true, restricted: false, delete: true },
            }),
          })
        }),
        http.delete('*/api/v1/cards/DEV-1', () => {
          deleted++
          return new HttpResponse(null, { status: 204 })
        }),
      )
      const { router } = renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      await userEvent.click(
        within(await openActions(window)).getByRole('menuitem', { name: 'Удалить…' }),
      )
      const confirm = await screen.findByRole('dialog', { name: 'Удалить DEV-1?' })
      expect(confirm).toHaveTextContent('попадёт в корзину')
      await userEvent.click(within(confirm).getByRole('button', { name: 'Удалить' }))

      expect(await screen.findByText('Карточка удалена в корзину')).toBeInTheDocument()
      expect(deleted).toBe(1)
      await waitFor(() => expect(router.state.location.pathname).toBe('/boards/board-1'))
      expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
      expect(screen.queryByText('Карточка не найдена')).not.toBeInTheDocument()
      expect(fetchedAfterDelete).toBe(0)
    })
  })

  describe('секции', () => {
    it('пустые секции скрыты; «+» → «Чек-лист» показывает секцию с фокусом в поле', async () => {
      serveCard(makeCardDetail())
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      expect(within(window).getByRole('region', { name: 'Основные параметры' })).toBeInTheDocument()
      expect(within(window).getByRole('region', { name: 'Описание' })).toBeInTheDocument()
      for (const name of ['Чек-листы', 'Связи', 'Блокировки', 'Файлы', 'Ссылки'])
        expect(within(window).queryByRole('region', { name })).not.toBeInTheDocument()
      // Пустое описание — подсказка, по щелчку — редактор
      expect(within(window).getByRole('button', { name: 'Добавьте описание…' })).toBeInTheDocument()

      await userEvent.click(
        within(await openAddMenu(window)).getByRole('menuitem', { name: 'Чек-лист' }),
      )
      const section = await within(window).findByRole('region', { name: 'Чек-листы' })
      await waitFor(() =>
        expect(within(section).getByLabelText('Название нового чек-листа')).toHaveFocus(),
      )
      await userEvent.click(within(section).getByRole('button', { name: 'Отмена' }))
      expect(within(window).queryByRole('region', { name: 'Чек-листы' })).not.toBeInTheDocument()
    })

    it('свёрнутая секция остаётся свёрнутой в следующей карточке; «Сведения» свёрнуты сразу', async () => {
      serveCard(makeCardDetail({ metrics: { lead_time_seconds: 7200, cycle_time_seconds: 3600 } }))
      const first = renderApp('/cards/DEV-1')
      let window = await screen.findByRole('dialog')

      const main = within(window).getByRole('button', { name: 'Основные параметры' })
      expect(main).toHaveAttribute('aria-expanded', 'true')
      await userEvent.click(main)
      expect(main).toHaveAttribute('aria-expanded', 'false')
      expect(within(window).getByText('Расположение')).not.toBeVisible()

      const info = within(window).getByRole('button', { name: 'Сведения' })
      expect(info).toHaveAttribute('aria-expanded', 'false')
      await userEvent.click(info)
      expect(within(window).getByText('Время выполнения (lead time)')).toBeInTheDocument()
      expect(within(window).getByText('2 ч')).toBeInTheDocument()
      first.unmount()

      renderApp('/cards/DEV-1')
      window = await screen.findByRole('dialog')
      expect(within(window).getByRole('button', { name: 'Основные параметры' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })

    it('активная блокировка — плашкой под рядом действий; история — секцией', async () => {
      serveCard(
        makeCardDetail({
          blocks: [
            {
              id: 'b2',
              reason: 'Ждём доступ',
              blocking_card: null,
              started_at: '2026-10-03T09:00:00Z',
              started_by: { id: 'u1', name: 'Борис' },
              ended_at: null,
              ended_by: null,
              end_reason: null,
            },
            {
              id: 'b1',
              reason: 'Ждали макет',
              blocking_card: null,
              started_at: '2026-10-01T09:00:00Z',
              started_by: { id: 'u1', name: 'Борис' },
              ended_at: '2026-10-02T09:00:00Z',
              ended_by: { id: 'u1', name: 'Борис' },
              end_reason: 'manual',
            },
          ],
        }),
      )
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')

      expect(within(window).getByText('Ждём доступ')).toBeInTheDocument()
      expect(within(window).getByRole('button', { name: 'Снять блокировку' })).toBeInTheDocument()
      const history = within(window).getByRole('region', { name: 'Блокировки' })
      expect(within(history).getByText('Ждали макет')).toBeInTheDocument()
      expect(within(history).queryByText('Ждём доступ')).not.toBeInTheDocument()
    })

    it('файл, брошенный на окно, становится вложением', async () => {
      serveCard(makeCardDetail())
      const uploaded = spyUploads()
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')
      const target = within(window).getByRole('region', { name: 'Описание' })
      const file = new File(['data'], 'notes.txt', { type: 'text/plain' })
      const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' }

      fireEvent.dragEnter(target, { dataTransfer })
      expect(within(window).getByText('Отпустите, чтобы приложить файл')).toBeInTheDocument()
      fireEvent.dragOver(target, { dataTransfer })
      fireEvent.drop(target, { dataTransfer })

      expect(await screen.findByText('Файл «notes.txt» приложен')).toBeInTheDocument()
      expect(uploaded).toEqual(['notes.txt'])
      expect(within(window).queryByText('Отпустите, чтобы приложить файл')).not.toBeInTheDocument()
    })

    it('без права прикладывать брошенный файл не загружается', async () => {
      serveCard(makeCardDetail({ archived_at: '2026-10-02T00:00:00Z' }))
      const uploaded = spyUploads()
      renderApp('/cards/DEV-1')
      const window = await screen.findByRole('dialog')
      const file = new File(['data'], 'notes.txt', { type: 'text/plain' })
      const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' }

      fireEvent.dragEnter(window, { dataTransfer })
      expect(within(window).queryByText('Отпустите, чтобы приложить файл')).not.toBeInTheDocument()
      fireEvent.drop(window, { dataTransfer })
      expect(uploaded).toEqual([])
    })
  })

  it('внизу — вкладки «Комментарии» (открыта) и «История»', async () => {
    serveCard(makeCardDetail())
    renderApp('/cards/DEV-1')
    const window = await screen.findByRole('dialog')

    expect(within(window).getByRole('tab', { name: 'Комментарии' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      await within(window).findByRole('textbox', { name: 'Новый комментарий' }),
    ).toBeInTheDocument()
    await userEvent.click(within(window).getByRole('tab', { name: 'История' }))
    expect(within(window).getByRole('tabpanel', { name: 'История' })).toBeInTheDocument()
  })
})
