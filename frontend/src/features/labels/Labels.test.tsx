import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Label } from '@/shared/types/api'
import { makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const company: Label = {
  id: 'l-sec',
  name: 'Безопасность',
  color: '#ef4444',
  scope: 'company',
  archived_at: null,
}
const local: Label = {
  id: 'l-front',
  name: 'Фронтенд',
  color: '#3b82f6',
  scope: 'space',
  archived_at: '2026-10-01T00:00:00Z',
}

describe('Метки', () => {
  it('системный администратор ведёт общие метки компании', async () => {
    signedInAs(makeUser())
    let body: unknown
    const archived: string[] = []
    server.use(
      http.get('*/api/v1/admin/labels', () => HttpResponse.json({ data: [company] })),
      http.post('*/api/v1/admin/labels', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: company }, { status: 201 })
      }),
      http.post('*/api/v1/labels/:id/archive', ({ params }) => {
        archived.push(String(params.id))
        return HttpResponse.json({ data: company })
      }),
    )
    renderApp('/admin/labels')

    expect(await screen.findByRole('heading', { name: 'Метки компании' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Добавить метку' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Клиент')
    await userEvent.click(screen.getByRole('button', { name: 'Цвет #f59e0b' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Метка сохранена')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Клиент', color: '#f59e0b' })

    await userEvent.click(screen.getByRole('button', { name: 'Действия с меткой «Безопасность»' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Архивировать' }))
    await vi.waitFor(() => expect(archived).toEqual(['l-sec']))
  })

  it('у «⋯» метки — подсказка с названием в «ёлочках» (LATER-80)', async () => {
    signedInAs(makeUser())
    server.use(http.get('*/api/v1/admin/labels', () => HttpResponse.json({ data: [company] })))
    renderApp('/admin/labels')

    const menu = await screen.findByRole('button', { name: 'Действия с меткой «Безопасность»' })
    expect(menu).not.toHaveAttribute('title')
    const user = userEvent.setup()
    await user.hover(menu)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Действия с меткой «Безопасность»')
    // По фокусу с клавиатуры — та же подсказка: ActionsMenu.test (jsdom не отличает фокус Tab от щелчка на странице)
  })

  it('ошибки сервера раскладываются в поля формы', async () => {
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/admin/labels', () => HttpResponse.json({ data: [] })),
      http.post('*/api/v1/admin/labels', () =>
        HttpResponse.json(
          { message: 'Ошибка', errors: { name: ['Метка с таким названием уже есть.'] } },
          { status: 422 },
        ),
      ),
    )
    renderApp('/admin/labels')

    await userEvent.click(await screen.findByRole('button', { name: 'Добавить метку' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Клиент')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Метка с таким названием уже есть.')).toBeInTheDocument()
  })

  it('на странице пространства: метки пространства и общие для справки', async () => {
    signedInAs(makeUser({ id: 'me', role: 'member' }))
    const space = makeSpace()
    let restored = false
    server.use(
      http.get('*/api/v1/spaces', () => HttpResponse.json({ data: [space] })),
      http.get('*/api/v1/spaces/DEV', () => HttpResponse.json({ data: space })),
      http.get('*/api/v1/spaces/DEV/labels', () => HttpResponse.json({ data: [company, local] })),
      http.post('*/api/v1/labels/l-front/restore', () => {
        restored = true
        return HttpResponse.json({ data: local })
      }),
    )
    renderApp('/spaces/DEV')

    await userEvent.click(await screen.findByRole('tab', { name: 'Метки' }))
    const row = (await screen.findByText('Фронтенд')).closest('tr')!
    expect(within(row).getByText('В архиве')).toBeInTheDocument()
    expect(screen.getByText('Безопасность')).toBeInTheDocument()

    await userEvent.click(within(row).getByRole('button', { name: 'Действия с меткой «Фронтенд»' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Восстановить' }))
    expect(await screen.findByText('Метка восстановлена')).toBeInTheDocument()
    expect(restored).toBe(true)
  })
})
