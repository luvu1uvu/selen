import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CardDetail, CardSummary } from '@/shared/types/api'
import { makeBoardDetail, makeCardDetail, makeCardHistory } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const summary = (key: string, title: string): CardSummary => ({
  id: key,
  key,
  title,
  board: { id: 'board-1', name: 'Продукт' },
  column: { name: 'To Do', category: 'queue' },
  archived_at: null,
})

/** Карточка DEV-1 и запись изменяющих запросов; поиск карточек — по строке search. */
function serve(card: CardDetail) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const searches: string[] = []
  const record =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const text = await request.text()
      calls.push({
        method,
        path: new URL(request.url).pathname,
        body: text ? JSON.parse(text) : null,
      })
      return HttpResponse.json({ data: card })
    }
  server.use(
    http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: card })),
    http.get('*/api/v1/spaces/DEV/cards', ({ request }) => {
      const search = new URL(request.url).searchParams.get('search') ?? ''
      searches.push(search)
      const all = [
        summary('DEV-1', 'Эта же'),
        summary('DEV-5', 'Миграция базы'),
        summary('DEV-6', 'Макет'),
      ]
      return HttpResponse.json({
        data: all.filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase())),
      })
    }),
    http.post('*/api/v1/cards/DEV-1/relations', record('POST')),
    http.delete('*/api/v1/cards/DEV-1/relations/:id', record('DELETE')),
    http.post('*/api/v1/cards/DEV-1/blocks', record('POST')),
    http.post('*/api/v1/card-blocks/:id/resolve', record('POST')),
  )
  return { calls, searches }
}

const visible = (key: string, title: string, category: 'queue' | 'done' = 'queue') => ({
  hidden: false as const,
  id: key,
  key,
  title,
  category,
  archived: false,
})

describe('Карточка: связи и блокировки', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member', timezone: 'Europe/Moscow' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/cards/DEV-1/history', () => HttpResponse.json(makeCardHistory())),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
    )
  })

  it('карточка в корзине в связях и блокировках — «Удалённая карточка», без номера и ссылки', async () => {
    serve(
      makeCardDetail({
        relations: {
          parents: [{ id: 'r1', card: { hidden: true, deleted: true } }],
          children: [],
          progress: null,
        },
        blocks: [
          {
            id: 'b1',
            reason: null,
            blocking_card: { hidden: true, deleted: true },
            started_at: '2026-10-02T07:00:00Z',
            started_by: { id: 'u1', name: 'Борис' },
            ended_at: '2026-10-03T07:00:00Z',
            ended_by: { id: 'u2', name: 'Админ' },
            end_reason: 'blocker_deleted',
          },
        ],
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    const relations = within(panel).getByRole('region', { name: 'Связи' })
    expect(within(relations).getByText('Удалённая карточка')).toBeInTheDocument()
    expect(within(relations).queryByRole('link')).not.toBeInTheDocument()
    const blocks = within(panel).getByRole('region', { name: 'Блокировки' })
    expect(blocks).toHaveTextContent('Удалённая карточка')
    expect(blocks).toHaveTextContent('блокирующая карточка удалена')
    expect(panel).not.toHaveTextContent('Скрытая карточка')
  })

  it('связи: родители и дочерние, «Скрытая карточка», прогресс; добавить через поиск и убрать', async () => {
    const { calls, searches } = serve(
      makeCardDetail({
        relations: {
          parents: [{ id: 'r1', card: visible('DEV-3', 'Эпик') }],
          children: [
            { id: 'r2', card: visible('DEV-4', 'Готовая', 'done') },
            { id: 'r3', card: { hidden: true } },
          ],
          progress: { done: 1, total: 2 },
        },
      }),
    )
    renderApp('/cards/DEV-1')
    const section = within(await screen.findByRole('dialog')).getByRole('region', { name: 'Связи' })

    expect(within(section).getByRole('link', { name: 'DEV-3' })).toHaveAttribute(
      'href',
      '/cards/DEV-3',
    )
    expect(within(section).getByText('Скрытая карточка')).toBeInTheDocument()
    expect(
      within(section).getByRole('progressbar', { name: 'Готово дочерних: 1 из 2' }),
    ).toBeInTheDocument()
    // Связь со скрытой карточкой не убрать
    expect(within(section).getAllByRole('button', { name: /^Убрать связь/ })).toHaveLength(2)

    await userEvent.click(within(section).getByRole('button', { name: 'Дочерняя' }))
    const picker = within(section).getByLabelText('Найти дочернюю карточку')
    await userEvent.type(picker, 'мигр')
    // Запрос уходит после паузы ввода; в результатах — только подходящие
    await vi.waitFor(() => expect(searches.at(-1)).toBe('мигр'))
    await vi.waitFor(() =>
      expect(within(section).queryByRole('button', { name: /DEV-6/ })).not.toBeInTheDocument(),
    )
    const result = await within(section).findByRole('button', { name: /DEV-5/ })
    // Текущая карточка в результатах не предлагается
    expect(within(section).queryByRole('button', { name: /Эта же/ })).not.toBeInTheDocument()
    await userEvent.click(result)
    expect(await screen.findByText('Связь добавлена')).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'Убрать связь с DEV-3' }))
    await vi.waitFor(() =>
      expect(calls).toEqual([
        {
          method: 'POST',
          path: '/api/v1/cards/DEV-1/relations',
          body: { card: 'DEV-5', kind: 'child' },
        },
        { method: 'DELETE', path: '/api/v1/cards/DEV-1/relations/r1', body: null },
      ]),
    )
  })

  it('блокировки: активная со скрытой карточкой, снятие, новая по причине и карточке, история', async () => {
    const { calls } = serve(
      makeCardDetail({
        blocks: [
          {
            id: 'b1',
            reason: 'Ждём доступы',
            blocking_card: { hidden: true },
            started_at: '2026-10-02T07:00:00Z',
            started_by: { id: 'u1', name: 'Борис' },
            ended_at: null,
            ended_by: null,
            end_reason: null,
          },
          {
            id: 'b0',
            reason: null,
            blocking_card: visible('DEV-2', 'Миграция', 'done'),
            started_at: '2026-10-01T07:00:00Z',
            started_by: { id: 'u1', name: 'Борис' },
            ended_at: '2026-10-01T09:00:00Z',
            ended_by: { id: 'u2', name: 'Вера' },
            end_reason: 'blocker_completed',
          },
        ],
      }),
    )
    renderApp('/cards/DEV-1')
    // Активная — плашкой под рядом действий окна, снятые — секцией «Блокировки»
    const section = await screen.findByRole('dialog')
    const history = within(section).getByRole('region', { name: 'Блокировки' })

    expect(within(section).getByText('Ждём доступы')).toBeInTheDocument()
    expect(within(section).getByText('Скрытая карточка')).toBeInTheDocument()
    expect(within(history).queryByText('Ждём доступы')).not.toBeInTheDocument()
    expect(
      within(history).getByText(/снята автоматически .*: блокирующая карточка готова/),
    ).toBeInTheDocument()

    await userEvent.click(within(section).getByRole('button', { name: 'Снять блокировку' }))
    expect(await screen.findByText('Блокировка снята')).toBeInTheDocument()

    // Новая — пунктом «+»
    await userEvent.click(within(section).getByRole('button', { name: 'Добавить в карточку' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Блокировку…' }))
    await userEvent.click(await within(section).findByRole('button', { name: 'Заблокировать' }))
    expect(
      within(section).getByText('Укажите причину или выберите блокирующую карточку.'),
    ).toBeInTheDocument()

    await userEvent.type(within(section).getByLabelText('Причина блокировки'), 'Нет макета')
    await userEvent.click(
      within(section).getByRole('button', { name: 'Выбрать блокирующую карточку' }),
    )
    await userEvent.click(await within(section).findByRole('button', { name: /DEV-6/ }))
    expect(within(section).getByText('Макет')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Заблокировать' }))

    await vi.waitFor(() =>
      expect(calls).toEqual([
        { method: 'POST', path: '/api/v1/card-blocks/b1/resolve', body: null },
        {
          method: 'POST',
          path: '/api/v1/cards/DEV-1/blocks',
          body: { reason: 'Нет макета', blocking_card: 'DEV-6' },
        },
      ]),
    )
  })

  it('без права правки — только просмотр связей и блокировок', async () => {
    serve(
      makeCardDetail({
        permissions: { edit: false, comment: true, restricted: false, delete: false },
        relations: {
          parents: [{ id: 'r1', card: visible('DEV-3', 'Эпик') }],
          children: [],
          progress: null,
        },
      }),
    )
    renderApp('/cards/DEV-1')
    const panel = await screen.findByRole('dialog')

    expect(within(panel).getByRole('region', { name: 'Связи' })).toHaveTextContent('Эпик')
    expect(within(panel).queryByRole('region', { name: 'Блокировки' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Заблокировать' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: 'Дочерняя' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /^Убрать связь/ })).not.toBeInTheDocument()
  })
})

describe('Карточка: лента истории', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member', timezone: 'Europe/Moscow' }))
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
      http.get('*/api/v1/card-types', () =>
        HttpResponse.json({ data: makeBoardDetail().card_types }),
      ),
      http.get('*/api/v1/cards/DEV-1', () => HttpResponse.json({ data: makeCardDetail() })),
    )
  })

  it('показывает перемещения и изменения полей по справочникам; скрытую карточку — без номера', async () => {
    const event = (id: string, event_type: string, payload: Record<string, unknown>) => ({
      id,
      kind: 'event' as const,
      at: '2026-10-02T09:00:00.000000Z',
      actor: { id: 'u1', name: 'Борис' },
      event_type,
      payload,
    })
    server.use(
      http.get('*/api/v1/cards/DEV-1/history', () =>
        HttpResponse.json(
          makeCardHistory({
            data: [
              event('e6', 'card.unblocked', {
                block_id: 'b1',
                blocking_card_id: 'hidden',
                end_reason: 'blocker_completed',
              }),
              event('e5', 'card.relation_added', {
                relation_id: 'r1',
                kind: 'child',
                card_id: 'c4',
              }),
              event('e4', 'card.blocked', {
                block_id: 'b1',
                blocking_card_id: 'hidden',
                has_reason: true,
              }),
              event('e3', 'card.comment_added', { comment_id: 'm1' }),
              event('e2', 'card.participant_added', { user_id: 'u2', via: 'auto_assign' }),
              event('e1', 'card.updated', {
                fields: ['estimate_hours', 'is_urgent', 'responsible_id', 'title'],
                changes: {
                  responsible_id: { from: null, to: 'u2' },
                  estimate_hours: { from: null, to: 6.5 },
                  is_urgent: { from: false, to: true },
                },
              }),
              {
                id: 't1',
                kind: 'transition',
                at: '2026-10-01T09:00:00.000000Z',
                transition: {
                  id: 1,
                  moved_at: '2026-10-01T09:00:00.000000Z',
                  reason: 'created',
                  actor: { id: 'u1', name: 'Борис' },
                  from_board: null,
                  to_board: { id: 'board-1', name: 'Продукт' },
                  from_column: null,
                  to_column: { id: 'todo', name: 'To Do' },
                  from_lane: null,
                  to_lane: { id: 'main', name: 'Основная' },
                  from_category: null,
                  to_category: 'queue',
                },
              },
            ],
            refs: {
              users: { u2: 'Вера' },
              card_types: {},
              labels: {},
              blocks: { b1: 'Ждём доступы' },
              cards: {
                c4: {
                  hidden: false,
                  id: 'c4',
                  key: 'DEV-4',
                  title: 'Подзадача',
                  category: 'queue',
                  archived: false,
                },
              },
            },
          }),
        ),
      ),
    )
    renderApp('/cards/DEV-1')
    const window = await screen.findByRole('dialog')
    await userEvent.click(within(window).getByRole('tab', { name: 'История' }))
    const history = within(window).getByRole('tabpanel', { name: 'История' })

    const lines = (await within(history).findAllByRole('listitem')).map((li) => li.textContent)
    expect(lines).toHaveLength(7)
    expect(lines[0]).toContain('Блокировка снята автоматически: Скрытая карточка готова')
    expect(lines[1]).toContain('Добавлена дочерняя карточка: DEV-4 «Подзадача»')
    expect(lines[2]).toContain('Карточка заблокирована')
    expect(lines[2]).toContain('Блокирует: Скрытая карточка')
    expect(lines[2]).toContain('Ждём доступы')
    expect(lines[3]).toContain('Комментарий')
    expect(lines[4]).toContain('Участник добавлен: Вера (автоназначение)')
    expect(lines[5]).toContain('Оценка: — → 6,5 ч')
    expect(lines[5]).toContain('Срочно: нет → да')
    expect(lines[5]).toContain('Ответственный: — → Вера')
    expect(lines[5]).toContain('Изменено: название')
    expect(lines[6]).toContain('Создана в «To Do»')
    expect(lines[6]).toContain('Борис')
  })

  it('карточка в корзине — «Удалённая карточка»; снятая из-за удаления блокировка подписана', async () => {
    const event = (id: string, event_type: string, payload: Record<string, unknown>) => ({
      id,
      kind: 'event' as const,
      at: '2026-10-02T09:00:00.000000Z',
      actor: { id: 'u1', name: 'Борис' },
      event_type,
      payload,
    })
    server.use(
      http.get('*/api/v1/cards/DEV-1/history', () =>
        HttpResponse.json(
          makeCardHistory({
            data: [
              event('e3', 'card.unblocked', {
                block_id: 'b1',
                blocking_card_id: 'deleted',
                end_reason: 'blocker_deleted',
              }),
              event('e2', 'card.relation_removed', {
                relation_id: 'r1',
                kind: 'parent',
                card_id: 'deleted',
              }),
              event('e1', 'card.blocked', {
                block_id: 'b1',
                blocking_card_id: 'deleted',
                has_reason: false,
              }),
            ],
          }),
        ),
      ),
    )
    renderApp('/cards/DEV-1')
    const window = await screen.findByRole('dialog')
    await userEvent.click(within(window).getByRole('tab', { name: 'История' }))
    const history = within(window).getByRole('tabpanel', { name: 'История' })

    const lines = (await within(history).findAllByRole('listitem')).map((li) => li.textContent)
    expect(lines[0]).toContain('Блокировка снята: блокирующая карточка удалена')
    expect(lines[1]).toContain('Удалённая карточка')
    expect(lines[2]).toContain('Блокирует: Удалённая карточка')
    expect(lines.join(' ')).not.toContain('Скрытая карточка')
  })
})
