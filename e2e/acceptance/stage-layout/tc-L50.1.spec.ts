import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome, pageAs } from '../../tests/helpers'
import { expectOnTop, LAPTOP, scrolls, wheelCanvas } from './helpers'

/**
 * ТК-L50.1 (LATER-50, п. 1): верхняя полоса с именем пользователя не уезжает при прокрутке ни на одной странице;
 * её нижняя граница — на одной линии с низом шапки левой панели («Дерево», «Администрирование»); вбок страница не
 * сдвигается. Доска «Продукт» демо-данных → «Длинная доска» (E2eSeeder), «Разработка» → пространство «Раскладка».
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Верхняя полоса на месте и вровень с шапкой левой панели; окно не прокручено ни вниз, ни вбок. */
async function expectTopBarInPlace(page: Page, panelHeading: string) {
  const bar = page.getByRole('banner')
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  const barBox = (await bar.boundingBox())!
  expect(barBox.y).toBe(0)
  // Шапка левой панели — строка с её названием и кнопкой «Свернуть панель»
  const panelHeader = page.getByRole('button', { name: 'Свернуть панель' }).locator('..')
  await expect(panelHeader).toContainText(panelHeading)
  const panelBox = (await panelHeader.boundingBox())!
  expect(Math.abs(panelBox.y + panelBox.height - (barBox.y + barBox.height))).toBeLessThanOrEqual(0.5)

  const page_ = await page.evaluate(() => ({
    window: [window.scrollX, window.scrollY],
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  expect(page_.window).toEqual([0, 0])
  expect(page_.width).toBe(LAPTOP.width)
  expect(page_.height).toBe(LAPTOP.height)
}

/**
 * Прокрутить колесом `main` обычной страницы вниз до конца. Колесо — внутри ожидания: страница может дорасти после
 * первого прокручивания (данные приходят после заголовка — раздел «Пользователи» с П2b-2: заголовок и вкладки
 * в общем макете видны раньше таблицы), тогда крутим ещё, пока не дойдём до настоящего конца.
 */
async function scrollMainToEnd(page: Page) {
  const main = page.getByRole('main')
  const box = (await main.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 20_000)
      return main.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop)
    })
    .toBeLessThanOrEqual(1)
  return main.evaluate((e) => e.scrollTop)
}

test('ТК-L50.1. Верхняя панель всегда на месте @tc-L50.1', async ({ page, browser }) => {
  // 1. Доска — колесом вниз до самого конца
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  await expectTopBarInPlace(page, 'Дерево')
  for (let i = 0; i < 10; i++) {
    const s = await scrolls(page)
    if (s.canvas >= s.canvasMax - 1) break
    await wheelCanvas(page, 3000)
    await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(s.canvas)
  }
  const s = await scrolls(page)
  expect(s.canvas).toBeGreaterThan(1000)
  expect(s.canvas).toBeGreaterThanOrEqual(s.canvasMax - 1)
  await expectTopBarInPlace(page, 'Дерево')

  // 2. Пространство — по ссылке перед названием доски, прокрутить вниз
  await page.getByRole('region', { name: 'Длинная доска' }).getByRole('link', { name: 'Раскладка', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Раскладка', level: 1 })).toBeVisible()
  await scrollMainToEnd(page)
  await expectTopBarInPlace(page, 'Дерево')

  // 4. Системный администратор: Администрирование → «Структура», «Пользователи», «Корзина», «Журнал событий»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await admin.setViewportSize(LAPTOP)
  await admin.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Администрирование' }).click()
  const sections = admin.getByRole('navigation', { name: 'Администрирование' })
  let scrolled = 0
  for (const section of ['Структура', 'Пользователи', 'Корзина', 'Журнал событий']) {
    await sections.getByRole('link', { name: section, exact: true }).click()
    await expect(admin.getByRole('heading', { name: section, level: 1 })).toBeVisible()
    // Данные страница запрашивает уже после перехода внутри приложения: waitForLoadState('networkidle') к этому
    // моменту давно выполнен и запросов не ждёт. Журнал (он длиннее окна) крутим, когда пришли строки, иначе колесо
    // крутит пустую таблицу и прокрутка 0 (LATER-68, CI)
    if (section === 'Журнал событий') await expect(admin.getByRole('main').getByRole('row').nth(1)).toBeVisible()
    scrolled = Math.max(scrolled, await scrollMainToEnd(admin))
    await expectTopBarInPlace(admin, 'Администрирование')
  }
  // Хотя бы одна из страниц длиннее окна (журнал событий) — проверка «прокрутили, а панель на месте» не пустая
  expect(scrolled).toBeGreaterThan(100)
  await admin.context().close()
})
