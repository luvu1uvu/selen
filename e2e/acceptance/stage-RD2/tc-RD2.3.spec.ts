import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { LIGHT, chooseTheme, expectShownTheme, isDark, resetTheme } from './helpers'

/**
 * ТК-RD2.3. Выбор темы сохраняется — после перезагрузки и на другом компьютере (на сервере и копией в браузере).
 * Анна → e2e-admin; предусловие («после ТК-RD2.2 выбрана Тёмная») тест создаёт сам и в конце возвращает «Светлую».
 *
 * Эмуляция вместо настоящего действия:
 * - «нет белой вспышки» (шаг 1) — страница после перезагрузки тёмная ещё до кода приложения: его скрипты не загружаются
 *   вовсе, тему ставит только /theme-init.js по копии в браузере; глазом вспышку проверяет PM;
 * - «другой браузер / приватное окно» (шаг 2) — новый контекст браузера без cookie и без копии темы (страница входа);
 *   вход формой в E2E запрещён (лимит входов) — «после входа» = новый контекст с cookie сессии e2e-admin, но без копии темы:
 *   тема приходит с сервера.
 */
test.use({ storageState: authFile(LIGHT.user) })

test.afterEach(async ({ browser }) => {
  await resetTheme(browser, LIGHT.user, 'light')
})

test('ТК-RD2.3. Выбор темы сохраняется — после перезагрузки и на другом компьютере @tc-RD2.3', async ({ page, browser }) => {
  // Предусловие: выбрана «Тёмная»
  await openHome(page)
  await chooseTheme(page, 'dark')
  await page.keyboard.press('Escape')
  await expectShownTheme(page, 'dark')

  // 1. Обновить страницу — сразу тёмная: даже без кода приложения (тему ставит /theme-init.js до стилей)
  await page.route('**/assets/*.js', (route) => route.abort())
  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('#root'), 'код приложения не загружен').toBeEmpty()
  await expectShownTheme(page, 'dark')
  await page.unroute('**/assets/*.js')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await expectShownTheme(page, 'dark')

  // 2. Другой браузер: страница входа — светлая (там тему ещё не выбирали)…
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const login = await fresh.newPage()
  await login.goto('/login')
  await expect(login.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expectShownTheme(login, 'light')
  await fresh.close()

  // …после входа — тёмная: выбор приходит с сервера и становится копией в этом браузере
  const { cookies } = await page.context().storageState()
  const other = await browser.newContext({ storageState: { cookies, origins: [] } })
  const device = await other.newPage()
  await openHome(device)
  await expectShownTheme(device, 'dark')
  expect(await device.evaluate(() => localStorage.getItem('selen.theme'))).toBe('dark')

  // 3. Во «втором браузере» — «Светлая»; первое окно после обновления — светлое (копия «Тёмная» устарела, верх берёт сервер)
  await chooseTheme(device, 'light')
  await expectShownTheme(device, 'light')
  await other.close()
  expect(await page.evaluate(() => localStorage.getItem('selen.theme')), 'в первом окне копия — прежняя').toBe('dark')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await expect.poll(() => isDark(page), 'первое окно после обновления — светлое').toBe(false)
  await expectShownTheme(page, 'light')
  expect(await page.evaluate(() => localStorage.getItem('selen.theme'))).toBe('light')
})
