import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { TrashedCard } from '@/shared/types/api'
import { makeUser, server, signedInAs, TEST_COMPANY_ID } from '@/test/server'
import { renderApp } from '@/test/render'

const trashed = (key: string, title: string, archived = false): TrashedCard => ({
  id: key,
  key,
  title,
  title_hidden: false,
  space: { id: 's1', key: 'DEV', name: 'Разработка' },
  board: { id: 'b1', name: 'Продукт' },
  archived,
  deleted_at: '2026-10-15T09:00:00Z',
  deleted_by: { id: 'a1', name: 'Анна Админова' },
})

describe('Корзина', () => {
  it('список удалённых карточек: номер, название, где лежала, кто и когда удалил; восстановление', async () => {
    signedInAs(makeUser({ timezone: 'Europe/Moscow' }))
    const restored: string[] = []
    server.use(
      http.get('*/api/v1/admin/companies/:company/trash/cards', () => {
        const data = [trashed('DEV-7', 'Старый отчёт', true), trashed('DEV-3', 'Логин')].filter(
          (card) => !restored.includes(card.key),
        )
        return HttpResponse.json({
          data,
          meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length },
        })
      }),
      http.post('*/api/v1/admin/companies/:company/trash/cards/:key/restore', ({ params }) => {
        restored.push(String(params.key))
        return HttpResponse.json({
          data: { ...trashed(String(params.key), 'Логин'), deleted_at: null, deleted_by: null },
        })
      }),
    )
    renderApp('/admin/trash')

    expect(await screen.findByRole('heading', { name: 'Корзина' })).toBeInTheDocument()
    const row = (await screen.findByText('Старый отчёт')).closest('tr')!
    expect(row).toHaveTextContent('DEV-7')
    expect(row).toHaveTextContent('из архива')
    expect(row).toHaveTextContent('Разработка')
    expect(row).toHaveTextContent('Продукт')
    expect(row).toHaveTextContent('Анна Админова')
    expect(row).toHaveTextContent('15 окт. 2026 г., 12:00')
    expect(screen.getByText('Логин').closest('tr')).not.toHaveTextContent('из архива')

    await userEvent.click(screen.getByRole('button', { name: 'Восстановить DEV-3' }))
    expect(await screen.findByText('DEV-3 восстановлена')).toBeInTheDocument()
    expect(restored).toEqual(['DEV-3'])
    await vi.waitFor(() => expect(screen.queryByText('Логин')).not.toBeInTheDocument())
  })

  it('из пространства без доступа — «Название скрыто», но номер, место, кто и когда удалил и «Восстановить» есть', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/trash/cards', () =>
        HttpResponse.json({
          data: [{ ...trashed('HR-4', ''), title: null, title_hidden: true }],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
        }),
      ),
    )
    renderApp('/admin/trash')

    const row = (await screen.findByText('Название скрыто (карточка вам недоступна)')).closest(
      'tr',
    )!
    expect(row).toHaveTextContent('HR-4')
    expect(row).toHaveTextContent('Разработка')
    expect(row).toHaveTextContent('Анна Админова')
    expect(within(row).getByRole('button', { name: 'Восстановить HR-4' })).toBeEnabled()
  })

  it('пустая корзина', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/trash/cards', () =>
        HttpResponse.json({
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
        }),
      ),
    )
    renderApp('/admin/trash')

    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
  })

  it('в меню администрирования есть «Корзина»; участнику раздел недоступен', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/trash/cards', () =>
        HttpResponse.json({
          data: [],
          meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
        }),
      ),
    )
    const { unmount } = renderApp('/admin/trash')
    await userEvent.click(await screen.findByRole('button', { name: 'Администрирование' }))
    const nav = await screen.findByRole('navigation', { name: 'Администрирование' })
    expect(within(nav).getByRole('link', { name: 'Корзина' })).toHaveAttribute(
      'href',
      `/admin/c/${TEST_COMPANY_ID}/trash`,
    )
    unmount()

    signedInAs(makeUser({ role: 'member' }))
    renderApp('/admin/trash')
    expect(await screen.findByRole('heading', { level: 1 })).not.toHaveTextContent('Корзина')
  })
})
