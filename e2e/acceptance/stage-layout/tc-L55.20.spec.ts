import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { block, canvas, DUTY, INFRA, loaded, overflowX, PRODUCT, rect, scrollToBoard, WIDE } from './rows'

/**
 * ТК-L55.20 (LATER-55): на узком экране (телефон, окно уже 768 px) доски — одна под другой, каждая во всю ширину окна:
 * «Дежурства», «Широкая доска», «Продукт», «Инфраструктура»; страница вбок не сдвигается, вбок прокручиваются только
 * колонки внутри доски; ручки ⠿ нет. «Разработка» демо-данных → RACC «Приёмка рядов» (E2eSeeder), Анна → e2e-admin.
 */
const PHONE = { width: 375, height: 812 }
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: PHONE })

const BOARDS = [DUTY, WIDE, PRODUCT, INFRA]

test('ТК-L55.20. Узкий экран — доски в колонку @tc-L55.20', async ({ page }) => {
  // 1. Открыть пространство: дерево — кнопкой меню ☰ слева вверху
  await openHome(page)
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: /^Приёмка рядов/ }).click()
  await expect(page).toHaveURL(/\/spaces\/RACC$/)
  await expect(page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })).toBeVisible()
  await loaded(page, DUTY)

  // Доски одна под другой, каждая во всю ширину окна (с отступом холста)
  const space = await canvas(page)
  const boxes: Awaited<ReturnType<typeof rect>>[] = []
  for (const name of BOARDS) boxes.push(await rect(page, name))
  for (const [i, box] of boxes.entries()) {
    expect(box.left - space.left, BOARDS[i]).toBeLessThanOrEqual(13)
    expect(space.right - box.right, BOARDS[i]).toBeLessThanOrEqual(13)
    if (i > 0) expect(box.top, BOARDS[i]).toBeGreaterThan(boxes[i - 1].bottom)
  }
  // Значка ⠿ нет
  expect(await page.locator('[data-board-handle]:visible').count()).toBe(0)

  // 2. Прокрутить страницу вниз; попробовать сдвинуть страницу вбок
  await page.mouse.move(PHONE.width / 2, PHONE.height / 2)
  await page.mouse.wheel(0, 1500)
  await expect.poll(async () => (await canvas(page)).scrollTop).toBeGreaterThan(space.scrollTop + 1000)
  const title = page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })
  await page.mouse.move(PHONE.width / 2, (await title.boundingBox())!.y + 10)
  await page.mouse.wheel(400, 0)
  await page.waitForTimeout(200)
  const sideways = await page.evaluate(() => ({
    window: window.scrollX,
    page: document.documentElement.scrollWidth,
    canvas: document.querySelector('[data-board-canvas]')!.scrollLeft,
    canvasOverflow: (() => {
      const canvas = document.querySelector('[data-board-canvas]')!
      return canvas.scrollWidth - canvas.clientWidth
    })(),
  }))
  expect(sideways).toEqual({ window: 0, page: PHONE.width, canvas: 0, canvasOverflow: 0 })

  // Вбок прокручиваются только колонки внутри доски
  await scrollToBoard(page, WIDE, 16)
  await loaded(page, WIDE)
  const wideBody = block(page, WIDE).locator('[data-board-body]')
  expect(await overflowX(wideBody)).toBeGreaterThan(1000)
  const box = (await wideBody.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 40)
  await page.mouse.wheel(600, 0)
  await expect.poll(() => wideBody.evaluate((body) => body.scrollLeft)).toBeGreaterThan(100)
  expect((await rect(page, WIDE)).left).toBe(boxes[1].left)
  expect(await page.evaluate(() => window.scrollX)).toBe(0)
})
