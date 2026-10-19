import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome, pageAs } from './helpers'

/**
 * Дорожки внутри доски и их личное сворачивание (LATER-55, ADR-0019). «Доска с дорожками» пространства «Раскладка»
 * (E2eSeeder): шаблон «Разработка» (шире окна), дорожки «Основная» (3 карточки в To Do), «Срочные» (2 в To Do,
 * 1 в In Progress), «Плановые» (1 в Backlog). Сворачивание хранится на сервере — каждый тест возвращает дорожки
 * развёрнутыми.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const BOARD = 'Доска с дорожками'

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', BOARD)
})

const lane = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const toggle = (page: Page, name: string, action: 'Свернуть' | 'Развернуть') =>
  lane(page, name).getByRole('button', { name: `${action} дорожку «${name}»` })
const cell = (page: Page, name: string) => page.getByRole('group', { name, exact: true })
/** Счётчик в заголовке колонки (колонки шаблона «Разработка» — по порядку). */
const columnCount = (page: Page, column: string) =>
  page.locator('[data-board-columns]').getByTitle(/карт\./).nth(['Backlog', 'To Do', 'In Progress'].indexOf(column))

test('свёрнутая дорожка — строка с названием и счётчиком; после перезагрузки свёрнута, у другого — развёрнута', async ({ page, browser }) => {
  const toDoCount = await columnCount(page, 'To Do').textContent()
  await expect(lane(page, 'Срочные')).toContainText('3 карточки')

  await toggle(page, 'Срочные', 'Свернуть').click()
  await expect(cell(page, 'To Do / Срочные')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Дорожная срочная 1$/ })).toHaveCount(0)
  await expect(lane(page, 'Срочные')).toContainText('3 карточки')
  // Счётчики колонок — по всем дорожкам, сворачивание их не меняет
  await expect(columnCount(page, 'To Do')).toHaveText(toDoCount!)

  await page.reload()
  await expect(toggle(page, 'Срочные', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect(cell(page, 'To Do / Срочные')).toHaveCount(0)
  await expect(cell(page, 'To Do / Основная')).toBeVisible()

  // Сворачивание личное: у администратора пространства дорожка развёрнута
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openBoard(admin, 'Раскладка', BOARD)
  await expect(cell(admin, 'To Do / Срочные')).toBeVisible()
  await admin.context().close()

  // Щелчок по строке свёрнутой дорожки разворачивает её
  await lane(page, 'Срочные').getByText('Срочные', { exact: true }).click()
  await expect(cell(page, 'To Do / Срочные')).toBeVisible()
  await expect(toggle(page, 'Срочные', 'Свернуть')).toHaveAttribute('aria-expanded', 'true')
  await page.reload()
  await expect(cell(page, 'To Do / Срочные')).toBeVisible()
})

test('свёрнутая дорожка не принимает перенос: карточка, отпущенная над её строкой, остаётся на месте', async ({ page }) => {
  await toggle(page, 'Плановые', 'Свернуть').click()
  await expect(cell(page, 'Backlog / Плановые')).toHaveCount(0)

  const card = cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })
  const from = (await card.boundingBox())!
  const row = (await lane(page, 'Плановые').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // Через ячейки «Срочных» — к строке свёрнутых «Плановых»
  for (let step = 1; step <= 20; step++) {
    const t = step / 20
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + (row.y + row.height / 2 - from.y - from.height / 2) * t,
    )
  }
  // Над строкой свёрнутой дорожки карточка показана на своём месте
  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toHaveCount(1)
  await page.mouse.up()

  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toBeVisible()
  await expect(lane(page, 'Плановые')).toContainText('1 карточка')
  await page.reload()
  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toBeVisible()

  await toggle(page, 'Плановые', 'Развернуть').click()
  await expect(cell(page, 'Backlog / Плановые')).toBeVisible()
})

test('«+» в заголовке колонки открывает форму в первой развёрнутой дорожке', async ({ page }) => {
  await toggle(page, 'Основная', 'Свернуть').click()
  await expect(cell(page, 'To Do / Основная')).toHaveCount(0)

  await page.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
  const form = cell(page, 'To Do / Срочные')
  await expect(form.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })).toBeFocused()
  await expect(form.locator('[data-slot="lane-value"]')).toHaveText('Срочные')
  await page.keyboard.press('Escape')

  await toggle(page, 'Основная', 'Развернуть').click()
  await expect(cell(page, 'To Do / Основная')).toBeVisible()
})

test('название дорожки слева и счётчик с шевроном справа видны при прокрутке доски вбок', async ({ page }) => {
  const block = (await page.locator(`section[aria-label="${BOARD}"]`).boundingBox())!
  const name = lane(page, 'Срочные').getByText('Срочные', { exact: true })
  const chevron = toggle(page, 'Срочные', 'Свернуть')
  const inside = async () => {
    const n = (await name.boundingBox())!
    const c = (await chevron.boundingBox())!
    expect(n.x).toBeGreaterThanOrEqual(block.x)
    expect(n.x).toBeLessThan(block.x + 40)
    expect(c.x + c.width).toBeLessThanOrEqual(block.x + block.width)
    expect(c.x + c.width).toBeGreaterThan(block.x + block.width - 40)
  }

  await inside()
  const overflow = await page.locator('[data-board-body]').evaluate((body) => {
    body.scrollLeft = body.scrollWidth
    return body.scrollWidth - body.clientWidth
  })
  expect(overflow).toBeGreaterThan(200)
  await inside()
})
