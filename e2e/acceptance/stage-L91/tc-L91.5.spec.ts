import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { tabTo } from '../stage-ux1/helpers'
import {
  BOARD,
  COLORS,
  contrast,
  expectColor,
  focusedRing,
  hex,
  isGrey,
  openThemeBoard,
  ringOf,
  SPACE,
  tile,
  token,
  type Rgba,
} from './helpers'

/**
 * ТК-L91.5 (LATER-91): рамка фокуса заметна — у элемента в фокусе с клавиатуры сплошная серая рамка (токен ring
 * #737373 без прозрачности, было #a1a1a1 / 50 % — 1,5:1), не меньше 3:1 и к белому, и к серому холсту; от щелчка по
 * кнопке или карточке рамки нет, у полей ввода (название, описание, комментарий, форма новой карточки) она видна и от
 * щелчка. Доска «Продукт» → «Вид» пространства THEME (E2eSeeder::themePrep), Анна → e2e-admin (администратор
 * пространства: у редактора нет «⋯» колонок и дорожек); окно карточки — «Срочная» (тест его только открывает:
 * описание и комментарий не сохраняет).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

/** Рамка у элемента в фокусе появилась (переход box-shadow — 150 мс) и она сплошная, серая, заметная. */
async function expectFocusRing(page: Page, what: string, surfaces: Rgba[]) {
  await expect
    .poll(async () => (await focusedRing(page))?.ring?.color.a ?? 0, { message: `${what}: рамка фокуса` })
    .toBe(1)
  const focused = (await focusedRing(page))!
  const ring = focused.ring!
  expect(isGrey(ring.color), `${what}: рамка серая (${hex(ring.color)})`).toBe(true)
  expectColor(ring.color, COLORS.ring, `${what}: цвет рамки`)
  expect(ring.width, `${what}: толщина рамки`).toBeGreaterThanOrEqual(2)
  for (const surface of [ring.under, ...surfaces]) {
    expect(contrast(ring.color, surface), `${what}: рамка к ${hex(surface)}`).toBeGreaterThanOrEqual(3)
  }
}

/** Рамки фокуса у элемента нет (подождав переход box-shadow). */
async function expectNoRing(page: Page, target: Locator, what: string) {
  await page.waitForTimeout(300)
  expect(await ringOf(target), `${what}: рамка от щелчка`).toBeNull()
}

test('ТК-L91.5. Рамка фокуса заметна @tc-L91.5', async ({ page }) => {
  await openThemeBoard(page)
  const surfaces = [await token(page, 'board'), await token(page, 'canvas'), await token(page, 'background')]
  expectColor(await token(page, 'ring'), COLORS.ring, 'токен ring')
  expect((await token(page, 'ring')).a, 'ring без прозрачности').toBe(1)

  // 1. Tab по доске: кнопки шапки, точка и «+», «⋯» колонок, «⋯» дорожки, карточки
  const keyboardTargets: [string, Locator][] = [
    ['«Меню пользователя»', page.getByRole('button', { name: 'Меню пользователя' })],
    ['«⋯» доски', page.getByRole('button', { name: `Действия с доской «${BOARD}»` })],
    ['точка категории Backlog', page.locator('[data-board-columns]').getByRole('img', { name: 'Очередь' }).first()],
    ['«+» колонки Backlog', page.getByRole('button', { name: 'Добавить карточку в начало Backlog' })],
    ['«⋯» колонки Backlog', page.getByRole('button', { name: 'Действия с колонкой «Backlog»' })],
    ['«⋯» колонки To Do', page.getByRole('button', { name: 'Действия с колонкой «To Do»' })],
    ['«⋯» дорожки', page.getByRole('button', { name: 'Действия с дорожкой «Основная»' })],
    ['карточка «Срочная»', tile(page, 'Срочная')],
    ['карточка «Заблокированная»', tile(page, 'Заблокированная')],
  ]
  for (const [what, target] of keyboardTargets) {
    await tabTo(page, target)
    await expectFocusRing(page, what, surfaces)
  }

  // От щелчка по кнопке, точке категории или карточке рамки нет
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const dot = page.locator('[data-board-columns]').getByRole('img', { name: 'Очередь' }).first()
  await dot.click()
  await expect(dot).toBeFocused()
  await expectNoRing(page, dot, 'точка категории')
  const toggle = page
    .getByRole('navigation', { name: 'Дерево' })
    .getByRole('button', { name: new RegExp(`^(Свернуть|Раскрыть) «${SPACE}»$`) })
  await toggle.click()
  await expect(toggle).toBeFocused()
  await expectNoRing(page, toggle, 'кнопка дерева')
  await toggle.click()
  const card = tile(page, 'Заблокированная')
  await card.hover()
  await page.mouse.down()
  await expectNoRing(page, card, 'карточка')
  await page.mouse.up()
  const blockedWindow = page.getByRole('dialog', { name: 'Заблокированная' })
  await expect(blockedWindow).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(blockedWindow).toHaveCount(0)

  // Поле формы новой карточки — рамка видна и от щелчка
  await page.getByRole('button', { name: 'Добавить карточку в начало Backlog' }).click()
  await expect(page.locator('textarea:focus')).toHaveCount(1)
  await expectFocusRing(page, 'форма новой карточки', surfaces)
  await page.keyboard.press('Escape')

  // 2. Окно карточки: Tab по полям и кнопкам — у каждого элемента в фокусе рамка
  await tile(page, 'Срочная').click()
  const window = page.getByRole('dialog', { name: 'Срочная' })
  await expect(window).toBeVisible()
  const title = window.getByRole('textbox', { name: 'Название' })
  await title.focus()
  const visited: string[] = []
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab')
    // Фокус, уходящий дальше сам (список вкладок передаёт его выбранной вкладке), — успокоился
    await page.waitForTimeout(150)
    const focused = await focusedRing(page)
    expect(focused, 'фокус внутри окна карточки').not.toBeNull()
    if (await title.evaluate((e) => e === document.activeElement)) break
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
      `${focused!.name}: фокус не ушёл из окна`,
    ).toBe(true)
    visited.push(focused!.name)
    await expectFocusRing(page, `окно карточки: ${focused!.name}`, surfaces)
  }
  expect(visited.length, `обход Tab: ${visited.join(' → ')}`).toBeGreaterThan(10)

  // Поля ввода окна — рамка видна и от щелчка: название, описание, комментарий
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await title.click()
  await expectFocusRing(page, 'название (щелчок)', surfaces)
  await window.getByRole('button', { name: 'Добавьте описание…' }).click()
  await expectFocusRing(page, 'описание (щелчок)', surfaces)
  await window.getByRole('button', { name: 'Отмена' }).click()
  await window.getByRole('textbox', { name: 'Новый комментарий' }).click()
  await expectFocusRing(page, 'комментарий (щелчок)', surfaces)
})
