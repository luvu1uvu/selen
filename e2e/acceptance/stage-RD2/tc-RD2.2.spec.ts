import { expect, test } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { LIGHT, chooseTheme, expectShownTheme, resetTheme, themeItem } from './helpers'

/**
 * ТК-RD2.2. Переключатель темы в меню пользователя: группа «Тема» — «Светлая», «Тёмная», «Как в системе» со значками,
 * по умолчанию «Светлая»; выбор меняет тему сразу, без перезагрузки, меню остаётся открытым. Анна → e2e-admin
 * (E2E Администратор), доска «Продукт» → «Вид» пространства THEME. Тест меняет тему e2e-admin и в конце возвращает
 * «Светлую». «Без переливания цветов» — только вручную (на время смены переходы выключены, но глазом это видно лучше).
 */
test.use({ storageState: authFile(LIGHT.user) })

test.afterEach(async ({ browser }) => {
  await resetTheme(browser, LIGHT.user, 'light')
})

test('ТК-RD2.2. Переключатель темы в меню пользователя @tc-RD2.2', async ({ page }) => {
  await openHome(page)
  await openSpaceBoard(page, LIGHT.space, LIGHT.board)
  await expectShownTheme(page, 'light')
  // Признак «без перезагрузки»: переменная страницы переживает все переключения
  await page.evaluate(() => ((window as unknown as { rd2NoReload: boolean }).rd2NoReload = true))

  // 1. Меню пользователя: имя и почта, группа «Тема» со значками, галочка у «Светлая», ниже — «Профиль» и «Выйти»
  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByText('E2E Администратор', { exact: true })).toBeVisible()
  await expect(menu.getByText(LIGHT.user, { exact: true })).toBeVisible()
  const group = menu.getByRole('group', { name: 'Тема' })
  await expect(group.getByText('Тема', { exact: true })).toBeVisible()
  await expect(group.getByRole('menuitemradio')).toHaveText(['Светлая', 'Тёмная', 'Как в системе'])
  // Значки: солнце, луна, монитор (значки lucide по имени)
  for (const [theme, icon] of [
    ['light', 'lucide-sun'],
    ['dark', 'lucide-moon'],
    ['system', 'lucide-monitor'],
  ] as const) {
    await expect(themeItem(page, theme).locator(`svg.${icon}`), `значок «${theme}»`).toBeVisible()
  }
  await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'true')
  await expect(themeItem(page, 'dark')).toHaveAttribute('aria-checked', 'false')
  await expect(themeItem(page, 'system')).toHaveAttribute('aria-checked', 'false')
  const profile = menu.getByRole('menuitem', { name: 'Профиль' })
  const logout = menu.getByRole('menuitem', { name: 'Выйти' })
  await expect(profile).toBeVisible()
  await expect(logout).toBeVisible()
  const lastTheme = (await themeItem(page, 'system').boundingBox())!
  const profileBox = (await profile.boundingBox())!
  expect(profileBox.y, '«Профиль» — ниже группы «Тема»').toBeGreaterThan(lastTheme.y)
  expect((await logout.boundingBox())!.y, '«Выйти» — ниже «Профиля»').toBeGreaterThan(profileBox.y)

  // 2. «Тёмная» — всё окно сразу тёмное, меню открыто, галочка у «Тёмная»
  await chooseTheme(page, 'dark')
  await expectShownTheme(page, 'dark')
  await expect(menu).toBeVisible()
  await expect(themeItem(page, 'light')).toHaveAttribute('aria-checked', 'false')

  // 3. Не закрывая меню: «Светлая», снова «Тёмная» — тема меняется при каждом выборе; Esc закрывает меню, тема тёмная
  await chooseTheme(page, 'light')
  await expectShownTheme(page, 'light')
  await expect(menu).toBeVisible()
  await chooseTheme(page, 'dark')
  await expectShownTheme(page, 'dark')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expectShownTheme(page, 'dark')
  expect(
    await page.evaluate(() => (window as unknown as { rd2NoReload?: boolean }).rd2NoReload),
    'страница не перезагружалась',
  ).toBe(true)
})
