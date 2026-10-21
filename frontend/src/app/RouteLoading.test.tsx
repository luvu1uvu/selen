import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { makeBoardDetail } from '@/test/boards'
import { makeUser, server, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

// Код страницы меток так и не пришёл (медленная сеть): видна заглушка
vi.mock('@/features/admin/LabelsPage', () => new Promise(() => {}))

describe('Первая загрузка страницы-чанка (HydrateFallback)', () => {
  it('нет предупреждения React Router «No HydrateFallback element»', async () => {
    const warn = vi.spyOn(console, 'warn')
    signedInAs(makeUser())
    server.use(
      http.get('*/api/v1/boards/board-1', () => HttpResponse.json({ data: makeBoardDetail() })),
    )
    renderApp('/boards/board-1')

    expect(await screen.findByRole('heading', { name: 'Продукт' })).toBeInTheDocument()
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('HydrateFallback'))
    warn.mockRestore()
  })

  it('пока код страницы грузится — «Загрузка…» на месте страницы, каркас и дерево уже видны', async () => {
    signedInAs(makeUser())
    renderApp('/admin/labels')

    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(within(screen.getByRole('main')).getByText('Загрузка…')).toBeInTheDocument()
  })
})
