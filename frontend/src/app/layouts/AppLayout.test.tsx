import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeUser, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

/** Экран уже 768 px: jsdom ширины не знает — matchMedia отвечает «не md». */
function narrowScreen() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('Меню на узком экране (LATER-108)', () => {
  beforeEach(() => signedInAs(makeUser({ role: 'member' })))
  afterEach(() => vi.unstubAllGlobals())

  it('открывается окном: фокус внутри, Esc закрывает, фокус возвращается на «Открыть меню»', async () => {
    narrowScreen()
    const user = userEvent.setup()
    renderApp('/')

    const open = await screen.findByRole('button', { name: 'Открыть меню' })
    expect(screen.queryByRole('navigation', { name: 'Дерево' })).not.toBeInTheDocument()
    await user.click(open)

    const menu = await screen.findByRole('dialog', { name: 'Меню' })
    expect(menu).toContainElement(screen.getByRole('navigation', { name: 'Дерево' }))
    await waitFor(() => expect(menu).toContainElement(document.activeElement as HTMLElement))

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Меню' })).not.toBeInTheDocument(),
    )
    expect(open).toHaveFocus()
  })

  it('«Закрыть меню» внутри окна закрывает его', async () => {
    narrowScreen()
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Открыть меню' }))
    const menu = await screen.findByRole('dialog', { name: 'Меню' })
    await user.click(screen.getByRole('button', { name: 'Закрыть меню' }))
    await waitFor(() => expect(menu).not.toBeInTheDocument())
  })
})
