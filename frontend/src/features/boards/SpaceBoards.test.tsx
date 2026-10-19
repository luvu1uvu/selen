import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { BoardSummary } from '@/shared/types/api'
import { makeBoardDetail } from '@/test/boards'
import { makeSpace, makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const boards: BoardSummary[] = [
  {
    id: 'board-1',
    space_id: 'space-1',
    name: 'Продукт',
    description: null,
    position: 'a0',
    archived_at: null,
  },
  {
    id: 'board-2',
    space_id: 'space-1',
    name: 'Старая',
    description: null,
    position: 'a1',
    archived_at: '2026-10-01T00:00:00Z',
  },
]

describe('Доски пространства', () => {
  beforeEach(() => {
    signedInAs(makeUser({ role: 'member' }))
    server.use(
      http.get('*/api/v1/spaces/DEV', () => HttpResponse.json({ data: makeSpace() })),
      http.get('*/api/v1/spaces/DEV/boards', () => HttpResponse.json({ data: boards })),
    )
  })

  it('создаёт доску из шаблона и открывает её', async () => {
    let body: unknown
    server.use(
      http.post('*/api/v1/spaces/DEV/boards', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: boards[0] }, { status: 201 })
      }),
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
    )
    renderApp('/spaces/DEV')

    expect(await screen.findByRole('link', { name: 'Продукт' })).toHaveAttribute(
      'href',
      '/boards/board-1',
    )
    expect(screen.getByText('Архивные доски (1)')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать доску' }))
    await userEvent.type(screen.getByLabelText('Название'), 'Маркетинг')
    await userEvent.click(screen.getByLabelText(/Простая/))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    expect(body).toEqual({ name: 'Маркетинг', description: null, template: 'simple' })
  })

  it('редактор не создаёт и не архивирует доски', async () => {
    server.use(
      http.get('*/api/v1/spaces/DEV', () =>
        HttpResponse.json({
          data: makeSpace({
            my_role: 'editor',
            permissions: { manage: false, edit_cards: true, view_access_sources: true },
          }),
        }),
      ),
    )
    renderApp('/spaces/DEV')

    expect(await screen.findByRole('link', { name: 'Продукт' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Создать доску' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Действия с доской/ })).not.toBeInTheDocument()
  })
})
