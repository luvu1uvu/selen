import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeUser, signedInAs } from '@/test/server'
import { renderApp } from '@/test/render'

const admin = makeUser({ id: 'admin-1', name: 'Сергей' })
const member = makeUser({ id: 'member-1', name: 'Иван', role: 'member' })

const treePanel = () => screen.queryByRole('navigation', { name: 'Дерево' })
const adminPanel = () => screen.queryByRole('navigation', { name: 'Администрирование' })

/**
 * Полоса разделов слева: выбранный раздел — самостоятельное состояние (как в Kaiten), не зависит от
 * открытой страницы и запоминается для пользователя в браузере.
 */
describe('Полоса разделов', () => {
  beforeEach(() => window.localStorage.clear())

  it('без сохранённого выбора — «Дерево», даже на странице админки', async () => {
    signedInAs(admin)
    renderApp('/admin/structure')

    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(adminPanel()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Дерево' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('выбранный раздел восстанавливается после обновления страницы', async () => {
    signedInAs(admin)
    const user = userEvent.setup()
    const first = renderApp('/')

    await user.click(await screen.findByRole('button', { name: 'Администрирование' }))
    await user.click(await screen.findByRole('link', { name: 'Структура' }))
    expect(await screen.findByRole('heading', { name: 'Структура', level: 1 })).toBeInTheDocument()
    first.unmount()

    // Обновление: снова «Администрирование»
    const second = renderApp('/admin/structure')
    expect(await screen.findByRole('navigation', { name: 'Администрирование' })).toBeInTheDocument()

    // «Дерево» при открытой «Структуре» — после обновления остаётся «Дерево»
    await user.click(screen.getByRole('button', { name: 'Дерево' }))
    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    second.unmount()

    renderApp('/admin/structure')
    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(adminPanel()).not.toBeInTheDocument()
    expect(window.localStorage.getItem('selen.nav.section.admin-1')).toBe('"tree"')
  })

  it('сохранённое «Администрирование» у не-администратора — «Дерево»', async () => {
    window.localStorage.setItem('selen.nav.section.member-1', '"admin"')
    signedInAs(member)
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(adminPanel()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Администрирование' })).not.toBeInTheDocument()
  })

  it('выбор у каждого пользователя свой; испорченное значение — «Дерево»', async () => {
    window.localStorage.setItem('selen.nav.section.member-1', '"admin"')
    window.localStorage.setItem('selen.nav.section.admin-1', '{oops')
    signedInAs(admin)
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Дерево' })).toBeInTheDocument()
    expect(treePanel()).toBeInTheDocument()
    expect(adminPanel()).not.toBeInTheDocument()
  })
})

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
