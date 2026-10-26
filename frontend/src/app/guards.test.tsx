import { screen } from '@testing-library/react'
import { makeUser, signedInAs, TEST_COMPANY_ID } from '@/test/server'
import { renderApp } from '@/test/render'

describe('Доступ к страницам', () => {
  it('гостя с защищённой страницы отправляет на вход', async () => {
    renderApp('/profile')
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument()
  })

  it('вошедшего пользователя со страницы входа отправляет на главную', async () => {
    signedInAs(makeUser({ role: 'member' }))
    renderApp('/login')
    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
  })

  it('неизвестный адрес админки — «Страница не найдена», без бесконечного перехода (ADR-0024)', async () => {
    signedInAs(makeUser())
    for (const path of [
      '/admin/nope',
      '/admin/c',
      '/admin/companies/x',
      `/admin/c/${TEST_COMPANY_ID}/nope`,
      `/admin/c/${TEST_COMPANY_ID}/users/u-1/x/y`,
    ]) {
      const { router, unmount } = renderApp(path)
      expect(
        await screen.findByRole('heading', { name: 'Страница не найдена' }),
      ).toBeInTheDocument()
      // Адрес не растёт: остался тем же
      expect(router.state.location.pathname).toBe(path)
      unmount()
    }
  })

  it('участнику не показывает админку ни в меню, ни по прямой ссылке', async () => {
    signedInAs(makeUser({ role: 'member' }))
    const { router } = renderApp('/admin/users')

    expect(await screen.findByRole('heading', { name: 'Пространства' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByText('Администрирование')).not.toBeInTheDocument()
  })

  it('администратору показывает раздел администрирования', async () => {
    signedInAs(makeUser({ role: 'admin' }))
    renderApp('/')
    expect(await screen.findByRole('button', { name: 'Администрирование' })).toBeInTheDocument()
  })

  it('Владельцу — тоже: у него все права системного администратора (ADR-0017)', async () => {
    signedInAs(makeUser({ role: 'owner' }))
    const { router } = renderApp('/admin/users')
    expect(await screen.findByRole('heading', { name: 'Пользователи' })).toBeInTheDocument()
    // Прежний адрес — в админку компании (ADR-0024)
    expect(router.state.location.pathname).toBe(`/admin/c/${TEST_COMPANY_ID}/users`)
    expect(screen.getByRole('button', { name: 'Администрирование' })).toBeInTheDocument()
  })
})
