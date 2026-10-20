import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { block, canvas, DUTY, INFRA, loaded, openSpace, PRODUCT, rect, WIDE } from './rows'

/**
 * ТК-L55.24 (LATER-81): в ряду из четырёх досок каждая не уже 20rem (320 px) — название и заголовок первой колонки
 * читаются; не помещаются — переходят на строку ниже внутри того же ряда, порядок слева направо сохраняется. Страница
 * вбок не сдвигается. «Разработка» демо-данных после перестановки (все доски в первом ряду) → RFOUR «Четыре в ряд
 * приёмки» (E2eSeeder), Анна → e2e-admin. Регрессионный тест: до исправления на 1024 px доски сжимались до ~100 px.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const MIN = 320
const BOARDS = [DUTY, WIDE, PRODUCT, INFRA]
const FIRST_COLUMN: Record<string, string> = {
  [DUTY]: 'Сейчас',
  [WIDE]: 'Backlog',
  [PRODUCT]: 'Backlog',
  [INFRA]: 'To Do',
}

const WINDOWS = [
  { width: 1024, height: 768, lines: [[DUTY, WIDE], [PRODUCT, INFRA]] },
  { width: 1280, height: 800, lines: [[DUTY, WIDE], [PRODUCT, INFRA]] },
  { width: 1920, height: 1080, lines: [BOARDS] },
]

/** Строки ряда, как видно на экране: доски с одним верхом — одна строка, слева направо. */
async function lines(page: Page) {
  const boxes = await Promise.all(BOARDS.map(async (name) => ({ name, ...(await rect(page, name)) })))
  const result: { top: number; names: string[] }[] = []
  for (const box of boxes.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = result.find((l) => Math.abs(l.top - box.top) < 2)
    if (line) line.names.push(box.name)
    else result.push({ top: box.top, names: [box.name] })
  }
  return result.map((l) => l.names)
}

for (const size of WINDOWS) {
  test(`ТК-L55.24. Ряд из четырёх досок, окно ${size.width} px @tc-L55.24`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await openSpace(page, 'RFOUR', 'Четыре в ряд приёмки')
    for (const name of BOARDS) await loaded(page, name)

    // Все четыре — в одном ряду
    await expect(page.locator('[data-board-row]')).toHaveCount(1)
    await expect(page.locator('[data-board-row] section[data-board-block]')).toHaveCount(4)

    // Строки внутри ряда: не помещаются — ниже, порядок сохраняется
    expect(await lines(page)).toEqual(size.lines)

    const space = await canvas(page)
    for (const name of BOARDS) {
      const box = await rect(page, name)
      // Не уже 20rem и не шире холста
      expect(box.width, name).toBeGreaterThanOrEqual(MIN)
      expect(box.left, name).toBeGreaterThanOrEqual(space.left)
      expect(box.right, name).toBeLessThanOrEqual(space.right)
      // Название доски видно целиком (без многоточия)
      const heading = block(page, name).getByRole('heading', { name, exact: true })
      await expect(heading).toBeVisible()
      expect(await heading.evaluate((h) => h.scrollWidth <= h.clientWidth), name).toBe(true)
      // Заголовок первой колонки — тоже целиком и внутри блока
      const column = block(page, name).getByText(FIRST_COLUMN[name], { exact: true }).first()
      await expect(column).toBeVisible()
      expect(await column.evaluate((c) => c.scrollWidth <= c.clientWidth), `${name}: ${FIRST_COLUMN[name]}`).toBe(true)
      const columnBox = (await column.boundingBox())!
      expect(columnBox.x + columnBox.width, `${name}: ${FIRST_COLUMN[name]}`).toBeLessThanOrEqual(box.right)
    }

    // Страница вбок не сдвигается
    const sideways = await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-canvas]')!
      return { page: document.documentElement.scrollWidth, canvas: canvas.scrollWidth - canvas.clientWidth }
    })
    expect(sideways).toEqual({ page: size.width, canvas: 0 })
  })
}
