import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { cardsIn, expectNoCrash, expectOnTop, LAPTOP, scrolls } from './helpers'

/**
 * ТК-L50.4 (LATER-50, п. 5): карточку из начала колонки взяли мышью и, не отпуская, подвели к нижнему краю окна —
 * доска сама прокручивается вниз; к правому краю доски — вбок; верхняя полоса и заголовки колонок на месте.
 * Отпустили над колонкой, которая показалась справа, — карточка встаёт в неё (видна там, где её отпустили) и после
 * перезагрузки там же. Доска «Продукт» → «Доска переносов» (E2eSeeder): Backlog и To Do по 30 карточек.
 * Регрессионный тест бага LATER-63: при отпускании доска отпрыгивала к месту, откуда карточку взяли.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L50.4. Перетаскивание с автопрокруткой @tc-L50.4', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Доска переносов')
  const source = cardsIn(page, 'Backlog').first()
  const name = (await source.getAttribute('aria-label'))!
  const card = page.getByRole('button', { name, exact: true })

  // 1. Взять карточку и, не отпуская, подвести к нижнему краю окна — подождать
  const from = (await card.boundingBox())!
  const x = from.x + from.width / 2
  await page.mouse.move(x, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(x + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(x + 10, LAPTOP.height - 15, { steps: 20 })
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(500)
  expect((await scrolls(page)).window).toEqual([0, 0])
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  await expectOnTop(page.getByRole('button', { name: 'Добавить карточку в начало To Do' }))

  // 2. Не отпуская, к правому краю доски — подождать, пока справа не покажется последняя колонка
  const body = (await page.locator('[data-board-body]').boundingBox())!
  const y = LAPTOP.height / 2
  await page.mouse.move(body.x + body.width - 10, y, { steps: 20 })
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(300)
  await expect.poll(async () => {
    const s = await scrolls(page)
    return s.bodyMax - s.body
  }).toBeLessThanOrEqual(1)
  const scrolled = await scrolls(page)
  expect(scrolled.header).toBe(scrolled.body)
  expect(scrolled.window).toEqual([0, 0])
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  await expectOnTop(page.getByRole('button', { name: 'Добавить карточку в начало Done' }))

  // Отпустить над колонкой Done, которая показалась справа
  const done = (await page.getByRole('group', { name: 'Done', exact: true }).boundingBox())!
  await page.mouse.move(done.x + done.width / 2, y, { steps: 10 })
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  expect((await moved).status()).toBe(200)
  await expectNoCrash(page)

  // Карточка — в колонке Done, там, где её отпустили: доска не отпрыгнула к колонке, откуда карточку взяли
  const dropped = page.getByRole('group', { name: 'Done', exact: true }).locator(card)
  await expect(dropped).toHaveCount(1)
  await page.waitForTimeout(500) // анимация броска dnd-kit
  await expect(dropped).toBeInViewport()
  const after = await scrolls(page)
  expect(after.body).toBeGreaterThan(300)
  expect(after.window).toEqual([0, 0])

  // После перезагрузки — там же
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Доска переносов' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Done', exact: true }).locator(card)).toHaveCount(1)
})
