import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import {
  BOARD,
  COLORS,
  colorsOf,
  contrast,
  expectColor,
  face,
  isGrey,
  openThemeBoard,
  over,
  ringOf,
  token,
} from './helpers'

/**
 * ТК-L91.3 (LATER-91): перевод на токены не перекрасил доску — цвета те же, что у прежних классов палитры Tailwind на
 * main: заблокированная карточка розовая (red-50) с красной рамкой и «Заблокирована» красным (red-700; рамка — red-500
 * вместо red-400, решение LATER-91: 3:1 к фону доски), срочная — светло-красная обводка (red-500 / 50 % ≈ прежний
 * red-300) и «Срочно»; сроки — розовые (red-100 / red-800) и мятные (emerald-100 / emerald-800) плашки; точки категорий —
 * slate-500, blue-600, emerald-600; полоса дорожки — прежний color-mix; затемнение под окном — чёрное 50 %; вторичный
 * текст — серый, темнее прежнего (#636363). Доска «Продукт» → «Вид» пространства THEME (E2eSeeder::themePrep),
 * Анна → e2e-admin. Сравнение «на глаз» со стендом PM — только вручную.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

test('ТК-L91.3. Вид доски почти не изменился @tc-L91.3', async ({ page }) => {
  // 1. Доска «Вид»
  await openThemeBoard(page)

  // 2. Заблокированная карточка: розовая, красная рамка, «Заблокирована» красным
  const blocked = face(page, 'Заблокированная')
  await expect(blocked.getByText('Заблокирована', { exact: true })).toBeVisible()
  const blockedColors = await colorsOf(blocked)
  expectColor(blockedColors.background, COLORS.red50, 'фон заблокированной карточки')
  expectColor(blockedColors.border, COLORS.red500, 'рамка заблокированной карточки')
  const blockedRing = (await ringOf(blocked))!
  expectColor(blockedRing.color, COLORS.red500, 'обводка заблокированной карточки')
  expect(blockedRing.color.a).toBe(1)
  expect(contrast(blockedColors.border, blockedColors.under), 'рамка к фону доски').toBeGreaterThanOrEqual(3)
  const blockedWord = await colorsOf(blocked.getByText('Заблокирована', { exact: true }))
  expectColor(blockedWord.text, COLORS.red700, '«Заблокирована»')
  expect(contrast(blockedWord.text, blockedColors.background)).toBeGreaterThanOrEqual(4.5)

  // Срочная: белая, светло-красная обводка, «Срочно» красным
  const urgent = face(page, 'Срочная')
  await expect(urgent.getByText('Срочно', { exact: true })).toBeVisible()
  const urgentColors = await colorsOf(urgent)
  expectColor(urgentColors.background, COLORS.white, 'фон срочной карточки')
  const urgentRing = (await ringOf(urgent))!
  expect(urgentRing.color.a, 'обводка срочной — полупрозрачная').toBeCloseTo(0.5, 1)
  expectColor(over(urgentRing.color, urgentColors.under), COLORS.red300, 'обводка срочной ≈ red-300', 16)
  expectColor((await colorsOf(urgent.getByText('Срочно', { exact: true }))).text, COLORS.red700, '«Срочно»')

  // Сроки: просрочено и после срока — розовые, в срок — мятные, срок впереди — серый текст без плашки
  for (const [title, card, background, text] of [
    ['Просрочено', 'Просроченная', COLORS.red100, COLORS.red800],
    ['Выполнено после срока', 'Готова после срока', COLORS.red100, COLORS.red800],
    ['Выполнено в срок', 'Готова в срок', COLORS.emerald100, COLORS.emerald800],
  ] as const) {
    const due = face(page, card).locator(`[title^="${title}"]`)
    await expect(due).toBeVisible()
    const colors = await colorsOf(due)
    expectColor(colors.background, background, `плашка «${title}»`)
    expectColor(colors.text, text, `текст «${title}»`)
    expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5)
  }
  const pending = await colorsOf(face(page, 'Со сроком').locator('[title^="Срок:"]'))
  expect(pending.background.a, 'срок впереди — без плашки').toBe(0)
  expectColor(pending.text, COLORS.muted, 'срок впереди — вторичный текст')

  // Точки категорий в заголовках колонок: серая, синяя, зелёная
  const columns = page.locator('[data-board-columns]')
  for (const [category, color] of [
    ['Очередь', COLORS.slate500],
    ['В работе', COLORS.blue600],
    ['Готово', COLORS.emerald600],
  ] as const) {
    const dot = columns.getByRole('img', { name: category, exact: true }).first().locator(':scope > span')
    expectColor((await colorsOf(dot)).background, color, `точка «${category}»`)
  }

  // Полоса дорожки — светло-серая, как прежний color-mix
  expectColor((await colorsOf(page.locator('[data-lane-row]').first())).background, COLORS.lane, 'полоса дорожки')

  // Вторичный текст (номер карточки, счётчик колонки) — серый, чуть темнее прежнего #737373, не меньше 4,5:1
  const number = await colorsOf(face(page, 'Срочная').getByText(/^THEME-\d+$/))
  expect(isGrey(number.text)).toBe(true)
  expectColor(number.text, COLORS.muted, 'номер карточки')
  expect(contrast(number.text, number.under)).toBeGreaterThanOrEqual(4.5)
  expectColor(await token(page, 'muted-foreground'), COLORS.muted, 'токен muted-foreground')

  // 3. «⋯» доски → «Переименовать доску»: затемнение под окном — чёрное 50 %; окно закрывается
  await page.getByRole('button', { name: `Действия с доской «${BOARD}»` }).click()
  await page.getByRole('menuitem', { name: 'Переименовать доску' }).click()
  const dialog = page.getByRole('dialog', { name: 'Переименовать доску' })
  await expect(dialog).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        // Что лежит поверх доски в углу экрана — затемнение под окном
        const top = document.elementFromPoint(4, window.innerHeight - 4)!
        return getComputedStyle(top).backgroundColor
      }),
    )
    .toMatch(/^(oklch\(0 0 0 \/ 0\.5\)|rgba\(0, 0, 0, 0\.5\))$/)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
