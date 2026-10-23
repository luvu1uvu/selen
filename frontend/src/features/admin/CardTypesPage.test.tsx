import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { CardType } from '@/shared/types/api'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const types: CardType[] = [
  { id: 't-1', name: 'Задача', color: '#3b82f6', is_default: true, archived_at: null },
  {
    id: 't-2',
    name: 'Баг',
    color: '#ef4444',
    is_default: false,
    archived_at: '2026-10-01T00:00:00Z',
  },
]

describe('Админка: типы карточек', () => {
  beforeEach(() => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/companies/:company/card-types', () =>
        HttpResponse.json({ data: types }),
      ),
    )
  })

  it('показывает тип по умолчанию и архивные', async () => {
    renderApp('/admin/card-types')

    const defaultRow = (await screen.findByText('Задача')).closest('tr')!
    expect(within(defaultRow).getByText('По умолчанию')).toBeInTheDocument()
    const archivedRow = screen.getByText('Баг').closest('tr')!
    expect(within(archivedRow).getByText('В архиве')).toBeInTheDocument()
  })

  it('создаёт тип с цветом из палитры', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/admin/companies/:company/card-types', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: types[0] }, { status: 201 })
      }),
    )
    renderApp('/admin/card-types')

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить тип' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Улучшение')
    await userEvent.click(screen.getByRole('button', { name: 'Цвет #f59e0b' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Тип сохранён')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Улучшение', color: '#f59e0b' })
  })

  it('восстанавливает архивный тип', async () => {
    let restored = false
    server.use(
      http.post('*/api/v1/admin/companies/:company/card-types/t-2/restore', () => {
        restored = true
        return HttpResponse.json({ data: types[1] })
      }),
    )
    renderApp('/admin/card-types')

    const row = (await screen.findByText('Баг')).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Действия с типом «Баг»' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Восстановить' }))

    expect(await screen.findByText('Тип восстановлен')).toBeInTheDocument()
    expect(restored).toBe(true)
  })
})
