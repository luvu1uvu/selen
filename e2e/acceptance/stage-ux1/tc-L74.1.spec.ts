import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { DESKTOP, expectHint, expectNoHint, focused, isTruncated, moveMouseAway } from './helpers'

/**
 * ТК-L74.1 (LATER-74): обрезанное название колонки и дорожки — многоточие, полное название в подсказке по наведению
 * и по фокусу Tab; название, которое видно целиком (To Do), Tab пропускает, подсказки у него нет. «Продукт» → доска
 * «Длинные названия» (LAYOUT, E2eSeeder: шаблон «Разработка», дорожки «Основная» и «Срочные»), Анна → e2e-admin.
 * Тест переименовывает колонку Backlog и дорожку «Основная», в конце возвращает прежние названия.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

const BOARD = 'Длинные названия'
const LONG_COLUMN = 'Подготовка релиза к выпуску для ключевых клиентов'
const LONG_LANE = 'Основная дорожка команды разработки, сопровождения и поддержки ключевых клиентов'

/** «⋯» → «Переименовать» → новое название → «Сохранить». */
async function rename(page: Page, menu: string, name: string) {
  await page.getByRole('button', { name: menu }).click()
  await page.getByRole('menuitem', { name: 'Переименовать' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Название').fill(name)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toHaveCount(0)
}

const columnTitle = (page: Page, name: string) => page.locator('[data-board-columns]').getByText(name, { exact: true })
const laneTitle = (page: Page, name: string) =>
  page.locator('[data-lane-row]').getByText(name, { exact: true }).first()

async function expectTruncatedWithHint(page: Page, title: Locator, text: string) {
  await expect(title).toBeVisible()
  expect(await isTruncated(title)).toBe(true)
  await title.hover()
  await expectHint(page, text)
  await moveMouseAway(page)
}

test('ТК-L74.1. Обрезанное название — полное в подсказке @tc-L74.1', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', BOARD)

  // 1. «⋯» в заголовке Backlog → «Переименовать» → длинное название
  await rename(page, 'Действия с колонкой «Backlog»', LONG_COLUMN)

  // 2. Название обрезано, при наведении — подсказка с полным названием
  await expectTruncatedWithHint(page, columnTitle(page, LONG_COLUMN), LONG_COLUMN)

  // 3. Tab с «⋯» шапки доски — до названия колонки: подсказка с полным названием
  await page.getByRole('button', { name: `Действия с доской «${BOARD}»` }).focus()
  const title = columnTitle(page, LONG_COLUMN)
  for (let i = 0; i < 3 && !(await title.evaluate((e) => e === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(title).toBeFocused()
  await expectHint(page, LONG_COLUMN)

  // Название «To Do» видно целиком: Tab его пропускает (с «⋯» колонки слева — сразу на точку типа To Do), подсказки нет
  await page.getByRole('button', { name: `Действия с колонкой «${LONG_COLUMN}»` }).focus()
  await page.keyboard.press('Tab')
  expect(await focused(page)).toBe('Очередь')
  await expect(columnTitle(page, 'To Do')).not.toBeFocused()
  expect(await isTruncated(columnTitle(page, 'To Do'))).toBe(false)
  await columnTitle(page, 'To Do').hover()
  await expectNoHint(page, 'To Do')
  await moveMouseAway(page)

  // 4. «⋯» дорожки «Основная» → «Переименовать» → длинное название; наведение — подсказка с полным названием
  await rename(page, 'Действия с дорожкой «Основная»', LONG_LANE)
  await expectTruncatedWithHint(page, laneTitle(page, LONG_LANE), LONG_LANE)
  // Обрезанное название дорожки получает фокус: подсказка видна и с клавиатуры
  await page.getByRole('button', { name: `Действия с колонкой «Done»` }).focus()
  for (let i = 0; i < 3 && !(await laneTitle(page, LONG_LANE).evaluate((e) => e === document.activeElement)); i++)
    await page.keyboard.press('Tab')
  await expect(laneTitle(page, LONG_LANE)).toBeFocused()
  await expectHint(page, LONG_LANE)

  // Вернуть прежние названия (данные других запусков)
  await rename(page, `Действия с дорожкой «${LONG_LANE}»`, 'Основная')
  await rename(page, `Действия с колонкой «${LONG_COLUMN}»`, 'Backlog')
})
