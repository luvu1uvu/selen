import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { block, DUTY, INFRA, loaded, openSpace, overflowX, PRODUCT, rect, WIDE } from './rows'

/**
 * ТК-L55.24 (LATER-81; решение PM 21.10, вариант Б): в ряду из четырёх досок ни одна не сжимается — каждая своей ширины
 * по колонкам (все колонки видны, без прокрутки вбок внутри), кроме доски шире экрана: она во всю ширину холста
 * и прокручивается вбок внутри блока. Доска, которой не хватает места в строке, — строкой ниже в том же ряду, порядок
 * сохраняется. Название и заголовок первой колонки читаются; страница вбок не сдвигается. «Разработка» демо-данных
 * после перестановки (все доски в первом ряду) → RFOUR «Четыре в ряд приёмки» (E2eSeeder), Анна → e2e-admin: «Дежурства»
 * (2 колонки, 578 px), «Широкая доска» (14), «Продукт» (8), «Инфраструктура» (4 колонки, 1138 px).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const BOARDS = [DUTY, WIDE, PRODUCT, INFRA]
const FIRST_COLUMN: Record<string, string> = {
  [DUTY]: 'Сейчас',
  [WIDE]: 'Backlog',
  [PRODUCT]: 'Backlog',
  [INFRA]: 'To Do',
}

// Холст: 1024 — 680 px, 1280 — 936, 1920 — 1576. Шире холста: на 1024 и 1280 — все, кроме «Дежурства»; на 1920 —
// «Широкая доска» и «Продукт». Рядом с соседкой не помещается ни одна — каждая на своей строке
const WINDOWS = [
  { width: 1024, height: 768, wider: [WIDE, PRODUCT, INFRA] },
  { width: 1280, height: 800, wider: [WIDE, PRODUCT, INFRA] },
  { width: 1920, height: 1080, wider: [WIDE, PRODUCT] },
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

    // Все четыре — в одном ряду; не помещаются в строку — ниже, порядок сохраняется
    await expect(page.locator('[data-board-row]')).toHaveCount(1)
    await expect(page.locator('[data-board-row] section[data-board-block]')).toHaveCount(4)
    expect(await lines(page)).toEqual(BOARDS.map((name) => [name]))

    const row = (await page.locator('[data-board-row]').boundingBox())!
    for (const name of BOARDS) {
      const box = await rect(page, name)
      const body = block(page, name).locator('[data-board-body]')
      if (size.wider.includes(name)) {
        // Шире экрана — во всю ширину холста, прокрутка вбок внутри блока
        expect(Math.abs(box.left - row.x), name).toBeLessThanOrEqual(1)
        expect(Math.abs(box.width - row.width), name).toBeLessThanOrEqual(1)
        expect(await overflowX(body), name).toBeGreaterThan(0)
      } else {
        // Своей ширины: все колонки видны, прокрутки вбок внутри нет; справа — фон холста
        expect(await overflowX(body), name).toBeLessThanOrEqual(1)
        expect(box.width, name).toBeLessThan(row.width - 100)
      }
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
