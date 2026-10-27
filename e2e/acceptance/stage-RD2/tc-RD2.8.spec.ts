import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { DARK, LIGHT, expectShownTheme, focusWithKeyboard, innerRing, outlineOf, styleOf } from './helpers'

/**
 * ТК-RD2.8. Пункт меню в фокусе с клавиатуры отмечен рамкой внутри пункта цветом акцента и серой подложкой (LATER-115);
 * от наведения мышью — только подложка, следующая клавиша возвращает рамку. Меню пользователя и «⋯» колонки To Do;
 * светлая (e2e-admin, THEME / «Вид») и тёмная (e2e-dark, DARK / «Вид») тема. Стрелки и Esc тему не меняют (выбор —
 * только Enter, пробел или щелчок), данные не меняются.
 */

/** Пункт в фокусе: подложка (не прозрачная) и рамка внутри пункта. */
async function expectKeyboardItem(page: Page, item: Locator, theme: 'light' | 'dark') {
  await expect(item).toBeFocused()
  expect(await outlineOf(item), 'рамка внутри пункта цветом акцента').toEqual(innerRing(theme))
  const background = (await styleOf(item)).background
  expect(background, 'у пункта в фокусе — подложка').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
}

async function checkMenuFocus(page: Page, space: string, board: string, theme: 'light' | 'dark') {
  await openHome(page)
  await openSpaceBoard(page, space, board)
  await expectShownTheme(page, theme)
  const menu = page.getByRole('menu')

  // 1. Tab до «Меню пользователя», Enter, стрелки вниз и вверх; Esc
  const userMenu = page.getByRole('button', { name: 'Меню пользователя' })
  await focusWithKeyboard(page, userMenu)
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expectKeyboardItem(page, page.getByRole('menuitemradio', { name: 'Светлая' }), theme)
  await page.keyboard.press('ArrowDown')
  await expectKeyboardItem(page, page.getByRole('menuitemradio', { name: 'Тёмная' }), theme)
  // Radix переводит фокус по стрелке следующей задачей (setTimeout) — следующую клавишу жмём, когда фокус перешёл
  await page.keyboard.press('ArrowDown')
  await expectKeyboardItem(page, page.getByRole('menuitemradio', { name: 'Как в системе' }), theme)
  await page.keyboard.press('ArrowDown')
  await expectKeyboardItem(page, page.getByRole('menuitem', { name: 'Профиль' }), theme)
  await page.keyboard.press('ArrowUp')
  await expectKeyboardItem(page, page.getByRole('menuitemradio', { name: 'Как в системе' }), theme)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // 2. Tab до «⋯» колонки To Do, Enter, стрелки; Esc
  const columnMenu = page.getByRole('region', { name: board }).getByRole('button', { name: 'Действия с колонкой «To Do»' })
  await focusWithKeyboard(page, columnMenu)
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  const items = menu.getByRole('menuitem')
  await expectKeyboardItem(page, items.nth(0), theme)
  await page.keyboard.press('ArrowDown')
  await expectKeyboardItem(page, items.nth(1), theme)
  expect((await outlineOf(items.nth(0))).style, 'у пункта, с которого ушли, рамки нет').toBe('none')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  // 3. Щелчок мышью по «Меню пользователя», указатель на «Профиль» — только подложка, без рамки; стрелка — рамка снова
  //    у пункта в фокусе
  await userMenu.click()
  await expect(menu).toBeVisible()
  const profile = page.getByRole('menuitem', { name: 'Профиль' })
  await profile.hover()
  await expect(profile).toHaveAttribute('data-highlighted', '')
  expect((await outlineOf(profile)).style, 'от наведения мышью — без рамки').toBe('none')
  expect((await styleOf(profile)).background, 'под указателем — подложка').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  await page.keyboard.press('ArrowDown')
  await expectKeyboardItem(page, page.getByRole('menuitem', { name: 'Выйти' }), theme)
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
}

test.describe('светлая тема', () => {
  test.use({ storageState: authFile(LIGHT.user) })

  test('ТК-RD2.8. Пункт меню в фокусе с клавиатуры отмечен рамкой — светлая тема @tc-RD2.8', async ({ page }) => {
    await checkMenuFocus(page, LIGHT.space, LIGHT.board, 'light')
  })
})

test.describe('тёмная тема', () => {
  test.use({ storageState: authFile(DARK.user) })

  test('ТК-RD2.8. Пункт меню в фокусе с клавиатуры отмечен рамкой — тёмная тема @tc-RD2.8', async ({ page }) => {
    await checkMenuFocus(page, DARK.space, DARK.board, 'dark')
  })
})
