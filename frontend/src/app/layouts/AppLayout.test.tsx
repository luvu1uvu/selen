import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import userEvent from '@testing-library/user-event'
import { makeUser, server, signedInAs } from '@/test/server'
import type { Theme } from '@/shared/types/api'
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

/**
 * Тема — только в меню пользователя (решения PM 21.10, LATER-89, пп. 6–8): «Светлая / Тёмная / Как в системе», по
 * умолчанию светлая; выбор меняет тему сразу и сохраняется на сервере, меню не закрывается (ADR-0025).
 */
describe('Тема в меню пользователя', () => {
  const root = document.documentElement

  async function openUserMenu() {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Меню пользователя' }))
    return user
  }

  it('три пункта группы «Тема», у текущей темы — отметка', async () => {
    signedInAs(makeUser({ theme: 'system' }))
    renderApp('/')
    await openUserMenu()

    const group = await screen.findByRole('group', { name: 'Тема' })
    const items = within(group).getAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual(['Светлая', 'Тёмная', 'Как в системе'])
    expect(within(group).getByRole('menuitemradio', { name: 'Как в системе' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(group).getByRole('menuitemradio', { name: 'Светлая' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  /** Сервер темы: PUT сохраняет, /auth/me отдаёт сохранённую; ответы PUT по очереди — из `statuses` (по умолчанию 200). */
  function themeServer(statuses: number[] = []) {
    const saved = { theme: admin.theme, sent: [] as unknown[] }
    server.use(
      http.get('*/api/v1/auth/me', () =>
        HttpResponse.json({ data: { ...admin, theme: saved.theme } }),
      ),
      http.put('*/api/v1/profile/theme', async ({ request }) => {
        const body = (await request.json()) as { theme: Theme }
        saved.sent.push(body)
        const status = statuses.shift() ?? 200
        if (status !== 200) return HttpResponse.json({ message: 'Ошибка' }, { status })
        saved.theme = body.theme
        return HttpResponse.json({ data: { ...admin, theme: body.theme } })
      }),
    )
    return saved
  }

  it('«Тёмная» — тема меняется сразу, выбор уходит на сервер и в браузер, меню остаётся открытым', async () => {
    const saved = themeServer()
    renderApp('/')
    expect(root).not.toHaveClass('dark')
    const user = await openUserMenu()

    await user.click(await screen.findByRole('menuitemradio', { name: 'Тёмная' }))

    expect(root).toHaveClass('dark')
    expect(window.localStorage.getItem('selen.theme')).toBe('dark')
    await waitFor(() => expect(saved.sent).toEqual([{ theme: 'dark' }]))
    expect(screen.getByRole('menuitemradio', { name: 'Тёмная' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // После сверки с сервером тема та же
    await waitFor(() => expect(saved.theme).toBe('dark'))
    expect(root).toHaveClass('dark')
  })

  it('сервер не сохранил — прежняя тема и уведомление', async () => {
    themeServer([500])
    renderApp('/')
    const user = await openUserMenu()

    await user.click(await screen.findByRole('menuitemradio', { name: 'Тёмная' }))

    expect(await screen.findByText('Тема не сохранилась. Выберите её ещё раз.')).toBeInTheDocument()
    expect(root).not.toHaveClass('dark')
    expect(window.localStorage.getItem('selen.theme')).toBe('light')
  })

  it('два выбора подряд, первый не сохранился — остаётся второй, без отката к прежней', async () => {
    const saved = themeServer([500, 200])
    renderApp('/')
    const user = await openUserMenu()

    await user.click(await screen.findByRole('menuitemradio', { name: 'Тёмная' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Как в системе' }))

    await waitFor(() => expect(saved.theme).toBe('system'))
    await waitFor(() => expect(window.localStorage.getItem('selen.theme')).toBe('system'))
    expect(screen.getByRole('menuitemradio', { name: 'Как в системе' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('сменился пользователь вкладки (409) — без уведомления «Тема не сохранилась»', async () => {
    signedInAs(admin)
    server.use(
      http.put('*/api/v1/profile/theme', () =>
        HttpResponse.json(
          { message: 'Сменился пользователь', code: 'session_changed' },
          { status: 409 },
        ),
      ),
    )
    // Уведомления прошлых тестов живут в общем хранилище sonner — проверяем сам вызов
    const error = vi.spyOn(toast, 'error')
    renderApp('/')
    const user = await openUserMenu()

    await user.click(await screen.findByRole('menuitemradio', { name: 'Тёмная' }))

    await waitFor(() => expect(root).not.toHaveClass('dark'))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
