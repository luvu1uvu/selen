import { expect, test } from '@playwright/test'
import { expectDarkScreen } from '../../dark/helpers'
import { authFile, openHome } from '../../tests/helpers'
import { DARK, RING, contrast, rgbOf, styleOf } from './helpers'

/**
 * ТК-RD2.6. Тёмная тема на всех экранах: страница пространства, профиль (поля, список, уведомление), администрирование
 * («Пользователи»), страница входа. admin@selen.test с «Тёмной» → e2e-dark (системный администратор, сохранена
 * «Тёмная»; система — светлая), «Разработка» → DARK «Тёмная проверка». «Сохранить» в профиле сохраняет те же значения.
 *
 * Эмуляция и «только вручную»:
 * - раскрытый список «Часовой пояс» — нативный, его рисует браузер (в DOM его нет): проверяем, что список в тёмной схеме
 *   (color-scheme: dark), вид раскрытого списка — вручную;
 * - «Выйти» (шаг 4) не нажимаем: выход завершил бы общую для прогона сессию e2e-dark. Вместо него — отдельный браузер,
 *   где e2e-dark открывал приложение, а потом его сессия кончилась (cookie удалены): страница входа — в теме устройства.
 */
test.use({ storageState: authFile(DARK.user) })

const TAB_LIST_GREY = 'rgb(47, 47, 53)' // --accent .dark #2f2f35
const BACKGROUND = 'rgb(25, 25, 28)' // --background .dark #19191c

test('ТК-RD2.6. Тёмная тема: пространство, профиль, админка, вход @tc-RD2.6', async ({ page, browser }) => {
  // 1. Дерево → пространство: панель тёмная, название крупнее (20 px, было 18 px), вкладка «Доски» — фоном страницы на сером
  //    списке с полосой акцента снизу; доски рядами — без светлых пятен
  await openHome(page)
  await page
    .getByRole('navigation', { name: 'Дерево' })
    .getByRole('link', { name: new RegExp(`${DARK.space}$`) })
    .click()
  const title = page.getByRole('heading', { name: DARK.space, level: 1 })
  await expect(title).toBeVisible()
  await expect(page.getByRole('region', { name: DARK.board }).locator('[data-card-tile]')).toHaveCount(6)
  await expectDarkScreen(page, 'пространство')
  expect(parseFloat((await styleOf(title)).fontSize), 'название пространства — крупнее').toBeGreaterThanOrEqual(20)
  const boardsTab = page.getByRole('tab', { name: 'Доски' })
  await expect(boardsTab).toHaveAttribute('aria-selected', 'true')
  const tab = await styleOf(boardsTab)
  expect(tab.background, 'выбранная вкладка — фоном страницы').toBe(BACKGROUND)
  expect((await styleOf(page.getByRole('tablist').first())).background, 'список вкладок — серый').toBe(TAB_LIST_GREY)
  expect(tab.boxShadow, 'полоса акцента 2 px снизу').toContain(`${RING.dark} 0px -2px 0px 0px inset`)

  // 2. Меню пользователя → «Профиль»: поля с заметной серой рамкой, список «Часовой пояс» — тёмный; «Сохранить» —
  //    уведомление «Профиль сохранён» тёмное и читается
  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Профиль' }).click()
  const name = page.getByRole('textbox', { name: 'Имя' })
  await expect(name).toBeVisible()
  const timezone = page.getByLabel('Часовой пояс')
  for (const [field, what] of [
    [name, 'поле «Имя»'],
    [timezone, 'список «Часовой пояс»'],
  ] as const) {
    const style = await styleOf(field)
    expect(style.borderWidth, `${what}: рамка`).toBe('1px')
    const border = await rgbOf(page, style.borderColor)
    expect(contrast(border, await rgbOf(page, BACKGROUND)), `${what}: рамка заметна (не меньше 3:1)`).toBeGreaterThanOrEqual(3)
    expect(style.colorScheme, `${what}: тёмная схема`).toBe('dark')
  }
  await timezone.click()
  await page.keyboard.press('Escape')
  await expectDarkScreen(page, 'профиль')
  await page.getByRole('button', { name: 'Сохранить' }).first().click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Профиль сохранён' })
  await expect(toast).toBeVisible()
  await expectDarkScreen(page, 'профиль с уведомлением')

  // 3. Полоса разделов → «Администрирование» → «Пользователи»: таблица, поиск и фильтр — тёмные, «Пользователи» слева —
  //    с полосой акцента
  await page.getByRole('button', { name: 'Администрирование' }).click()
  const adminNav = page.getByRole('navigation', { name: 'Администрирование' })
  await adminNav.getByRole('link', { name: 'Пользователи' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(page.getByRole('cell', { name: /E2E Тёмная тема/ }).first()).toBeVisible()
  await expectDarkScreen(page, 'админка: пользователи')
  const usersLink = adminNav.getByRole('link', { name: 'Пользователи' })
  await expect(usersLink).toHaveAttribute('aria-current', 'page')
  expect((await styleOf(usersLink)).boxShadow, '«Пользователи» — полоса акцента слева').toContain(
    `${RING.dark} 2px 0px 0px 0px inset`,
  )
  const main = page.getByRole('main')
  for (const control of [main.getByRole('textbox', { name: /Поиск/ }), main.getByRole('combobox', { name: 'Статус' })]) {
    const style = await styleOf(control)
    expect(style.colorScheme).toBe('dark')
    expect((await rgbOf(page, style.background)).a, 'фон поля — прозрачный поверх тёмной страницы').toBe(0)
  }

  // 4. Выход → страница входа тёмная (тема устройства, пока пользователь неизвестен)
  const device = await browser.newContext({ storageState: authFile(DARK.user) })
  const before = await device.newPage()
  await openHome(before)
  await expect.poll(() => before.evaluate(() => localStorage.getItem('selen.theme'))).toBe('dark')
  // Каждый ответ Laravel заново ставит cookie сессии — cookie удаляем, когда запросы страницы закончились и она закрыта
  await before.waitForLoadState('networkidle')
  await before.close()
  await device.clearCookies()
  const other = await device.newPage()
  await other.goto('/')
  await expect(other).toHaveURL(/\/login/)
  await expect(other.getByRole('button', { name: 'Войти' })).toBeVisible()
  await expectDarkScreen(other, 'вход')
  await device.close()
})
