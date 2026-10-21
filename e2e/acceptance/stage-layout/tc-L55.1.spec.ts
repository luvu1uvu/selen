import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { cell, LANES, LANES_BOARD, LAPTOP, lane, laneRow, openLanesBoard, toggle } from './helpers'

/**
 * ТК-L55.1 (LATER-55, шаг 1): дорожки — строки внутри одной доски. Под заголовками колонок — полоса «Основная» во всю
 * ширину доски: слева название и «⋯», справа число карточек дорожки и стрелка ˄; под полосой — карточки дорожки по
 * колонкам. Полоса «Срочные» такая же, над ней — тонкая линия; всё внутри одного блока доски, отдельных блоков у
 * дорожек нет. Анна (администратор «Разработки») → e2e-admin, администратор «Раскладки»: «⋯» дорожки видит только
 * администратор пространства. Доска «Продукт» → «Дорожки приёмки» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

test('ТК-L55.1. Дорожки — строки внутри доски @tc-L55.1', async ({ page }) => {
  // 1. Открыть доску, посмотреть под заголовки колонок
  await openLanesBoard(page)
  const board = page.getByRole('region', { name: LANES_BOARD })
  const body = page.locator('[data-board-body]')
  const bodyBox = (await body.boundingBox())!
  const header = (await page.locator('[data-board-columns]').boundingBox())!

  // Все полосы — внутри блока доски
  await expect(board.locator('[data-lane-row]')).toHaveCount(LANES.length)

  // Полоса «Основная» — сразу под заголовками колонок, во всю ширину доски
  const main = laneRow(page, 'Основная')
  const mainBox = (await main.boundingBox())!
  expect(Math.abs(mainBox.y - (header.y + header.height))).toBeLessThanOrEqual(2)
  expect(Math.abs(mainBox.x - bodyBox.x)).toBeLessThanOrEqual(1)
  const contentWidth = await body.evaluate((e) => e.scrollWidth)
  expect(contentWidth).toBeGreaterThan(bodyBox.width)
  expect(Math.abs(mainBox.width - contentWidth)).toBeLessThanOrEqual(1)

  for (const name of ['Основная', 'Срочные']) {
    const row = laneRow(page, name)
    // Слева — название и «⋯», справа — число карточек дорожки и стрелка ˄ (в видимой части доски)
    const title = (await row.getByText(name, { exact: true }).boundingBox())!
    const menu = (await row.getByRole('button', { name: `Действия с дорожкой «${name}»` }).boundingBox())!
    const chevron = toggle(page, name, 'Свернуть')
    await expect(chevron).toHaveAttribute('aria-expanded', 'true')
    const chevronBox = (await chevron.boundingBox())!
    const count = (await row.getByText('3', { exact: true }).boundingBox())!
    await expect(row).toContainText('3 карточки')
    expect(title.x - bodyBox.x).toBeLessThan(40)
    expect(menu.x).toBeGreaterThan(title.x + title.width - 1)
    expect(menu.x - (title.x + title.width)).toBeLessThan(24)
    expect(bodyBox.x + bodyBox.width - (chevronBox.x + chevronBox.width)).toBeLessThan(40)
    expect(bodyBox.x + bodyBox.width - (chevronBox.x + chevronBox.width)).toBeGreaterThanOrEqual(0)
    expect(count.x + count.width).toBeLessThanOrEqual(chevronBox.x)
    expect(chevronBox.x - (count.x + count.width)).toBeLessThan(24)
  }

  // Под полосой «Основная» — её карточки по колонкам (3 в To Do)
  const mainToDo = cell(page, 'To Do / Основная')
  await expect(mainToDo.getByRole('button', { name: /^Открыть LAYOUT-\d+: Приёмочная основная/ })).toHaveCount(3)
  expect((await mainToDo.boundingBox())!.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height - 1)

  // 2. Прокрутить вниз до «Срочных»: над полосой — тонкая линия; у первой полосы линии нет (под ней — граница
  //    заголовков колонок)
  await laneRow(page, 'Срочные').scrollIntoViewIfNeeded()
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll('[data-lane-row]')].map((row) => {
      const style = getComputedStyle(row)
      return { width: style.borderTopWidth, style: style.borderTopStyle }
    }),
  )
  expect(lines[0].width).toBe('0px')
  for (const line of lines.slice(1)) expect(line).toEqual({ width: '1px', style: 'solid' })

  // Отдельных блоков у дорожек нет: без рамок, скруглений, теней и своего фона, дорожки идут вплотную друг к другу
  const blocks = await page.evaluate((names) => {
    return names.map((name) => {
      const section = document.querySelector(`[data-board-body] section[aria-label="${name}"]`)!
      const style = getComputedStyle(section)
      const box = section.getBoundingClientRect()
      return {
        border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        radius: style.borderRadius,
        shadow: style.boxShadow,
        background: style.backgroundColor,
        margin: [style.marginTop, style.marginBottom],
        top: box.top,
        bottom: box.bottom,
      }
    })
  }, LANES)
  for (const [index, block] of blocks.entries()) {
    expect(block.border).toEqual(['0px', '0px', '0px', '0px'])
    expect(block.radius).toBe('0px')
    expect(block.shadow).toBe('none')
    expect(block.background).toBe('rgba(0, 0, 0, 0)')
    expect(block.margin).toEqual(['0px', '0px'])
    if (index > 0) expect(Math.abs(block.top - blocks[index - 1].bottom)).toBeLessThanOrEqual(1)
  }

  // Под «Срочными» — их карточки
  await expect(lane(page, 'Срочные').getByRole('button', { name: /: Приёмочная срочная/ })).toHaveCount(3)
})
