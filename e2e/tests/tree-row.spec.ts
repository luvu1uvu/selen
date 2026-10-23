import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Строка дерева (пачка UX-2): длинное название — в одну строку с «…», у дерева нет прокрутки вбок, полное название —
 * в подсказке по наведению и по фокусу (LATER-109); значок «доступно всем» — отдельный элемент с фокусом и подсказкой
 * Tooltip (LATER-88); «+» и «⋯» — поверх конца названия, видны целиком и нажимаются. Данные — папка → папка →
 * пространство LONGTREE → доска с длинными названиями (E2eSeeder, LONG_*). «Доступно всем» в E2E-данных ни у кого нет
 * (группа «Все сотрудники» открыла бы пространство всем пользователям тестов) — его ставит подменённый ответ дерева.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const FOLDER = 'E2E Папка с очень длинным названием, которое не помещается в дерево'
const SUBFOLDER = 'E2E Вложенная папка с очень длинным названием для многоточия'
const SPACE = 'E2E Пространство с очень длинным названием для проверки многоточия'
const BOARD = 'E2E Доска с очень длинным названием на самом глубоком уровне дерева'

type Node = { type: string; name?: string; space?: { name: string }; everyone: boolean; children?: Node[] }

/** Пометить «доступно всем» вложенную папку и пространство с длинными названиями. */
async function markEveryone(page: Page) {
  await page.route('**/api/v1/navigation', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { data: Node[] }
    const mark = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.name === SUBFOLDER || node.space?.name === SPACE) node.everyone = true
        mark(node.children ?? [])
      }
    }
    mark(body.data)
    await route.fulfill({ response, json: body })
  })
}

const tree = (page: Page) => page.getByRole('navigation', { name: 'Дерево' })

/** Подсказка с этим текстом: прежняя, уходя, ещё мгновение в документе. */
const tooltip = (page: Page, text: string) => page.getByRole('tooltip').filter({ hasText: text })

async function expand(row: Locator) {
  if ((await row.getAttribute('aria-expanded')) === 'false') await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
}

/** Название строки обрезано: текст шире своего места, правый край строки — в пределах дерева. */
async function expectTruncated(page: Page, row: Locator, name: string, container: Locator = tree(page)) {
  const text = row.getByText(name, { exact: true })
  const sizes = await text.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }))
  expect(sizes.scroll, `«${name}» обрезано`).toBeGreaterThan(sizes.client)
  expect(sizes.client, `«${name}»: видно хотя бы несколько букв`).toBeGreaterThan(30)
  const containerBox = (await container.boundingBox())!
  const rowBox = (await row.boundingBox())!
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 0.5)
}

test('длинные названия — «…» без прокрутки вбок, полное название в подсказке (LATER-109)', async ({ page }) => {
  await page.goto('/')
  const nav = tree(page)
  const folder = nav.getByRole('button', { name: FOLDER, exact: true })
  await expand(folder)
  const subfolder = nav.getByRole('button', { name: SUBFOLDER, exact: true })
  await expand(subfolder)
  const space = nav.getByRole('link', { name: SPACE, exact: true })
  // Раскрытое пространство запоминается в браузере, а у стрелки меняется подпись — раскрыть, только если свёрнуто
  const toggle = nav.getByRole('button', { name: `Раскрыть «${SPACE}»` })
  if (await toggle.isVisible()) await toggle.click()
  const board = nav.getByRole('link', { name: BOARD, exact: true })
  await expect(board).toBeVisible()

  // У дерева нет прокрутки вбок: содержимое не шире панели
  const widths = await nav.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)

  for (const [row, name] of [
    [folder, FOLDER],
    [subfolder, SUBFOLDER],
    [space, SPACE],
    [board, BOARD],
  ] as const) {
    await expectTruncated(page, row, name)
    // Высота строки — прежняя
    expect((await row.boundingBox())!.height).toBe(32)
  }

  // Полное название — в подсказке по наведению и по фокусу с клавиатуры
  await board.hover()
  await expect(tooltip(page, BOARD)).toHaveText(BOARD)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await space.focus()
  await expect(tooltip(page, SPACE)).toHaveText(SPACE)
})

test('значок «доступно всем» — с фокусом и подсказкой; «+» и «⋯» поверх конца названия (LATER-88, LATER-109)', async ({
  page,
}) => {
  await markEveryone(page)
  await page.goto('/')
  const nav = tree(page)
  await expand(nav.getByRole('button', { name: FOLDER, exact: true }))
  await expand(nav.getByRole('button', { name: SUBFOLDER, exact: true }))
  const space = nav.getByRole('link', { name: SPACE, exact: true })
  await expect(space).toBeVisible()

  // Значок — между значком пространства и названием, не сжат; Tab со ссылки — на значок, подсказка видна
  const mark = nav.getByRole('img', { name: 'Доступно всем сотрудникам' })
  const markBox = (await mark.boundingBox())!
  const spaceBox = (await space.boundingBox())!
  const nameBox = (await space.getByText(SPACE, { exact: true }).boundingBox())!
  expect(markBox.width).toBe(14)
  expect(markBox.x).toBeGreaterThan(spaceBox.x)
  expect(markBox.x + markBox.width).toBeLessThanOrEqual(nameBox.x)
  expect(markBox.y).toBeGreaterThanOrEqual(spaceBox.y)
  expect(markBox.y + markBox.height).toBeLessThanOrEqual(spaceBox.y + spaceBox.height)
  // Tab со строки — на стрелку раскрытия, затем на значок: порядок как на экране (U-4 UX-ревью пачки UX-2)
  await space.focus()
  await page.keyboard.press('Tab')
  await expect(nav.getByRole('button', { name: new RegExp(`^(Раскрыть|Свернуть) «${SPACE}»$`) })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(mark).toBeFocused()
  await expect(tooltip(page, 'Доступно всем сотрудникам')).toHaveText('Доступно всем сотрудникам')
  await page.keyboard.press('Escape')

  await mark.hover()
  await expect(tooltip(page, 'Доступно всем сотрудникам')).toHaveText('Доступно всем сотрудникам')
  const folderMark = nav.getByRole('img', { name: 'Все пространства папки доступны всем сотрудникам' })
  await folderMark.hover()
  await expect(tooltip(page, 'Все пространства папки доступны всем сотрудникам')).toHaveText('Все пространства папки доступны всем сотрудникам')

  // «+» и «⋯» — при наведении на строку, поверх конца названия, целиком в пределах дерева; нажимаются
  await space.hover()
  const add = nav.getByRole('button', { name: `Добавить в «${SPACE}»` })
  const menu = nav.getByRole('button', { name: `Меню «${SPACE}»` })
  const navBox = (await nav.boundingBox())!
  for (const button of [add, menu]) {
    await expect(button).toBeVisible()
    const box = (await button.boundingBox())!
    expect(box.x).toBeGreaterThan(nameBox.x)
    expect(box.x + box.width).toBeLessThanOrEqual(navBox.x + navBox.width)
  }
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Переместить в…' })).toBeVisible()
  await page.keyboard.press('Escape')
  await space.hover()
  await add.click()
  await expect(page.getByRole('menuitem', { name: 'Доску' })).toBeVisible()
})

test('«Структура» на узком экране — длинное название не растягивает страницу (найдено при LATER-109)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/admin/structure')
  const row = page.getByRole('listitem').filter({ hasText: FOLDER })
  await expect(row).toBeVisible()

  const main = page.locator('main')
  const widths = await main.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }))
  expect(widths.scroll).toBeLessThanOrEqual(widths.client)
  await expectTruncated(page, row, FOLDER, main)
  // «⋯» строки — в пределах экрана по ширине (строка может быть ниже первого экрана — к ней прокручиваем)
  const menu = row.getByRole('button', { name: /^Действия с/ })
  await menu.scrollIntoViewIfNeeded()
  const box = (await menu.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  // Полное название — в подсказке: обрезанное название получает фокус
  await row.getByText(FOLDER, { exact: true }).focus()
  await expect(tooltip(page, FOLDER)).toHaveText(FOLDER)
})
