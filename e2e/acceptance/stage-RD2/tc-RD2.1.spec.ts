import { expect, test } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { LIGHT, expectShownTheme, rgbOf, contrast, styleOf } from './helpers'

/**
 * ТК-RD2.1. Светлая тема «Линии» на доске: светлый фон, серый холст, белые доски и карточки с тонкими рамками; выбранное
 * — сиреневая подложка и индиго-полоска (раздел полосы, строка дерева), главная кнопка — индиго с белым текстом; номер
 * карточки — тем же шрифтом, что название, с ровными цифрами. Анна → e2e-admin (тема «Светлая»), «Разработка» /
 * «Продукт» → THEME «Тёмная тема» / «Вид» (E2eSeeder::themePrep). «Раскладка как раньше» — только вручную (раскладку
 * доски держат свои E2E: board-layout, board-grid, lanes).
 */
test.use({ storageState: authFile(LIGHT.user) })

// Цвета «Линии» в светлой теме (frontend/src/index.css, :root)
const WHITE = 'rgb(255, 255, 255)'
const CANVAS = 'rgb(236, 237, 241)' // --canvas #ecedf1
const BORDER = 'rgb(228, 228, 231)' // --border #e4e4e7
const SELECTED = 'rgb(227, 226, 246)' // --selected #e3e2f6, сиреневая подложка
const PRIMARY = 'rgb(79, 70, 229)' // --primary #4f46e5, индиго

test('ТК-RD2.1. Светлая тема «Линии» на доске @tc-RD2.1', async ({ page }) => {
  // 1. Дерево → пространство → доска (страница пространства, доски рядами)
  await openHome(page)
  await openSpaceBoard(page, LIGHT.space, LIGHT.board)
  await expectShownTheme(page, 'light')
  const board = page.getByRole('region', { name: LIGHT.board })
  await expect(board.locator('[data-card-tile]').first()).toBeVisible()

  // Фон светлый, холст вокруг досок — серый, доска и карточки — белые с тонкой рамкой
  await expect(page.locator('[data-board-canvas]')).toHaveCSS('background-color', CANVAS)
  const boardStyle = await styleOf(board)
  expect(boardStyle.background, 'доска белая').toBe(WHITE)
  expect([boardStyle.borderWidth, boardStyle.borderColor], 'тонкая рамка доски').toEqual(['1px', BORDER])
  const face = board.getByRole('button', { name: /^Открыть THEME-\d+: Со сроком$/ }).locator(':scope > div')
  const faceStyle = await styleOf(face)
  expect(faceStyle.background, 'карточка белая').toBe(WHITE)
  expect([faceStyle.borderWidth, faceStyle.borderColor], 'тонкая рамка карточки').toEqual(['1px', BORDER])

  // 2. Активный раздел полосы («Дерево») — сиреневая подложка и короткая индиго-полоска у левого края полосы
  const rail = page.getByRole('navigation', { name: 'Разделы' })
  const treeSection = rail.getByRole('button', { name: 'Дерево' })
  await expect(treeSection).toHaveAttribute('aria-pressed', 'true')
  expect((await styleOf(treeSection)).background, 'подложка раздела').toBe(SELECTED)
  const stripe = await treeSection.evaluate((button) => {
    const before = getComputedStyle(button, '::before')
    const box = button.getBoundingClientRect()
    // Полоса разделов — колонка 56 px, в ней навигация с кнопками (кнопка — в 8 px от края полосы)
    const railBox = button.closest('nav')!.parentElement!.getBoundingClientRect()
    return {
      content: before.content,
      color: before.backgroundColor,
      width: parseFloat(before.width),
      height: parseFloat(before.height),
      buttonHeight: box.height,
      // Полоска стоит на left относительно кнопки
      left: box.left + parseFloat(before.left) - railBox.left,
    }
  })
  expect(stripe.content, 'полоска нарисована').not.toBe('none')
  expect(stripe.color, 'полоска — индиго').toBe(PRIMARY)
  expect(stripe.width).toBe(3)
  expect(stripe.height, 'полоска короче кнопки').toBeLessThan(stripe.buttonHeight)
  expect(Math.abs(stripe.left), 'полоска у левого края полосы').toBeLessThanOrEqual(1)

  // Строка доски в дереве — сиреневая подложка, индиго-полоска слева, текст полужирнее; при наведении — такая же
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  const row = tree.getByRole('link', { name: LIGHT.board, exact: true })
  await expect(row).toHaveAttribute('aria-current', 'page')
  const rowStyle = await styleOf(row)
  expect(rowStyle.background, 'подложка строки').toBe(SELECTED)
  expect(rowStyle.boxShadow, 'индиго-полоска слева (2 px)').toContain(`${PRIMARY} 2px 0px 0px 0px inset`)
  const plainRow = tree.locator('a:not([aria-current])').first()
  expect(rowStyle.fontWeight, 'текст выбранной строки полужирнее').toBeGreaterThan((await styleOf(plainRow)).fontWeight)
  await row.hover()
  const hovered = await styleOf(row)
  expect([hovered.background, hovered.boxShadow], 'при наведении строка не меняется').toEqual([
    rowStyle.background,
    rowStyle.boxShadow,
  ])

  // Главная кнопка «Создать доску» на панели пространства — индиго с белым текстом (не чёрная)
  const create = page.getByRole('button', { name: 'Создать доску' })
  await expect(create).toBeVisible()
  const createStyle = await styleOf(create)
  expect(createStyle.background, 'кнопка — индиго').toBe(PRIMARY)
  expect(createStyle.color, 'текст кнопки — белый').toBe(WHITE)
  expect(contrast(await rgbOf(page, createStyle.color), await rgbOf(page, createStyle.background))).toBeGreaterThanOrEqual(4.5)

  // Номер карточки — тем же шрифтом, что название, цифры ровные (табличные), не моноширинный
  const tile = board.getByRole('button', { name: /^Открыть THEME-\d+: Со сроком$/ })
  const number = await styleOf(tile.getByText(/^THEME-\d+$/))
  const title = await styleOf(tile.getByText('Со сроком', { exact: true }))
  expect(number.fontFamily, 'номер — шрифтом названия').toBe(title.fontFamily)
  expect(number.fontFamily).not.toMatch(/mono/i)
  expect(number.fontVariantNumeric, 'цифры номера ровные').toContain('tabular-nums')
})
