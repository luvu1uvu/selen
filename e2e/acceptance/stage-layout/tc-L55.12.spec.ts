import { expect, test } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { LAPTOP, wheelCanvas } from './helpers'
import { block, canvas, DUTY, INFRA, layout, loaded, PRODUCT, rect, scrollToBoard, START_LAYOUT, WIDE } from './rows'

/**
 * ТК-L55.12 (LATER-55, шаг 3): все доски пространства — рядами на одной странице. Сверху — панель пространства
 * (название, ключ, ⓘ, вкладки, «Архив досок», «Создать доску», «Изменить»), она и верхняя полоса с именем остаются на
 * месте при прокрутке; под панелью на сером холсте — блоки досок: [«Дежурства», «Широкая доска»], [«Продукт»],
 * [«Инфраструктура»], между ними — фон холста; у каждой доски своя шапка (⠿, название, «⋯», ˄) и строка заголовков
 * колонок. «Разработка» демо-данных → RACC «Приёмка рядов» (E2eSeeder), Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const BOARDS = [DUTY, WIDE, PRODUCT, INFRA]

test('ТК-L55.12. Все доски пространства — рядами на одной странице @tc-L55.12', async ({ page }) => {
  // 1. Дерево → «Приёмка рядов» (щелчок по названию пространства)
  await openHome(page)
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  await tree.getByRole('link', { name: /^Приёмка рядов/ }).click()
  await expect(page).toHaveURL(/\/spaces\/RACC$/)

  // Панель: «Приёмка рядов», «RACC», ⓘ, вкладки «Доски / Участники / Метки», «Архив досок», «Создать доску», «Изменить»
  const title = page.getByRole('heading', { name: 'Приёмка рядов', level: 1 })
  await expect(title).toBeVisible()
  await expect(page.getByText('RACC', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'О пространстве' })).toBeVisible()
  for (const tab of ['Доски', 'Участники', 'Метки']) await expect(page.getByRole('tab', { name: tab })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Доски' })).toHaveAttribute('aria-selected', 'true')
  for (const button of ['Архив досок', 'Создать доску', 'Изменить'])
    await expect(page.getByRole('button', { name: button, exact: true })).toBeVisible()

  // Блоки досок рядами: в первом ряду «Дежурства» и справа «Широкая доска», ниже «Продукт», ещё ниже «Инфраструктура»
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
  await loaded(page, DUTY)
  await loaded(page, WIDE)
  const duty = await rect(page, DUTY)
  const wide = await rect(page, WIDE)
  const product = await rect(page, PRODUCT)
  const infra = await rect(page, INFRA)
  expect(Math.abs(duty.top - wide.top)).toBeLessThanOrEqual(1)
  expect(wide.left).toBeGreaterThan(duty.right)
  expect(product.top).toBeGreaterThan(Math.max(duty.bottom, wide.bottom))
  expect(infra.top).toBeGreaterThan(product.bottom)
  for (const box of [product, infra]) expect(Math.abs(box.left - duty.left)).toBeLessThanOrEqual(1)

  // Между блоками — серый фон холста (не блок доски), и он отличается от фона блока
  const gaps = await page.evaluate(
    (points) =>
      points.map(({ x, y }) => {
        const hit = document.elementFromPoint(x, y)!
        return { inBlock: hit.closest('section[data-board-block]') !== null, inCanvas: hit.closest('[data-board-canvas]') !== null }
      }),
    [
      { x: (duty.right + wide.left) / 2, y: duty.top + 20 },
      { x: duty.left + 40, y: (Math.max(duty.bottom, wide.bottom) + product.top) / 2 },
    ],
  )
  expect(gaps).toEqual([
    { inBlock: false, inCanvas: true },
    { inBlock: false, inCanvas: true },
  ])
  const backgrounds = await page.evaluate((name) => {
    const bg = (el: Element) => getComputedStyle(el).backgroundColor
    return { canvas: bg(document.querySelector('[data-board-canvas]')!), block: bg(document.querySelector(`section[aria-label="${name}"]`)!) }
  }, DUTY)
  expect(backgrounds.canvas).not.toBe(backgrounds.block)

  // У каждой доски своя шапка (⠿, название, «⋯», ˄) и строка заголовков колонок
  for (const name of BOARDS) {
    if (name === PRODUCT || name === INFRA) {
      await scrollToBoard(page, name, 16)
      await loaded(page, name)
    }
    const board = block(page, name)
    const header = board.locator('header').first()
    await expect(header.locator('[data-board-handle]')).toBeVisible()
    await expect(header.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect(header.getByRole('button', { name: `Действия с доской «${name}»` })).toBeVisible()
    await expect(header.getByRole('button', { name: `Свернуть доску «${name}»` })).toBeVisible()
    await expect(board.locator('[data-board-columns]')).toBeVisible()
  }

  // 2. Прокрутить страницу вниз до конца и обратно — панель и верхняя полоса с именем на месте
  await scrollToBoard(page, DUTY, 16)
  const titleBox = (await title.boundingBox())!
  const userMenu = page.getByRole('button', { name: 'Меню пользователя' })
  const userBox = (await userMenu.boundingBox())!
  const until = async (dy: number, done: (c: Awaited<ReturnType<typeof canvas>>) => boolean) => {
    await expect
      .poll(
        async () => {
          await wheelCanvas(page, dy)
          return done(await canvas(page))
        },
        { timeout: 15_000 },
      )
      .toBe(true)
  }
  await until(3000, (c) => c.max > 0 && c.max - c.scrollTop <= 1)
  expect((await canvas(page)).scrollTop).toBeGreaterThan(1000)
  await expect(block(page, INFRA)).toBeInViewport()
  expect(await title.boundingBox()).toEqual(titleBox)
  expect(await userMenu.boundingBox()).toEqual(userBox)
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0])

  await until(-3000, (c) => c.scrollTop === 0)
  expect(await title.boundingBox()).toEqual(titleBox)
  expect(await userMenu.boundingBox()).toEqual(userBox)
  await expect(block(page, DUTY)).toBeInViewport()
})
