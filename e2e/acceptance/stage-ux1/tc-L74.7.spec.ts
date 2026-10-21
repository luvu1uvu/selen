import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, loaded } from '../stage-layout/rows'
import { LAPTOP } from './helpers'

/**
 * ТК-L74.7 (U-7 UX-ревью варианта Б, дополнение PM 21.10): у края доски, за которым ещё есть колонки, — мягкая тень
 * (у тела доски и у строки заголовков колонок); докручено до края — тени у него нет; у доски, которая помещается
 * целиком, тени нет. «Разработка» → RACC «Приёмка рядов» (E2eSeeder): «Инфраструктура» при 1440 px с деревом шире
 * видимой части на несколько десятков px, «Дежурства» помещается. Анна → e2e-editor. Только смотрим и листаем.
 * Что тень «заметна глазу» — только вручную; здесь — видна ли она (непрозрачность) и где.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

/** Тени у краёв доски (тело и строка заголовков): сколько видно у левого и у правого края. */
function shades(page: Page, board: string) {
  return page.evaluate((board) => {
    const section = document.querySelector(`section[aria-label="${board}"]`)!
    const visible = (side: string) =>
      [...section.querySelectorAll<HTMLElement>(`[data-board-shade="${side}"]`)].filter(
        (e) => Number(getComputedStyle(e).opacity) > 0.5 && e.getBoundingClientRect().width > 0,
      ).length
    return { start: visible('start'), end: visible('end') }
  }, board)
}

test('ТК-L74.7. Видно, что доска листается вбок @tc-L74.7', async ({ page }) => {
  // 1. Дерево → пространство → «Инфраструктура»
  await openHome(page)
  await openSpaceBoard(page, 'Приёмка рядов', 'Инфраструктура')
  await loaded(page, 'Инфраструктура')
  const body = block(page, 'Инфраструктура').locator('[data-board-body]')
  const overflow = await body.evaluate((e) => e.scrollWidth - e.clientWidth)
  expect(overflow).toBeGreaterThan(10)
  expect(overflow).toBeLessThan(200)

  // 2. В начале: тень у правого края (тело и заголовки колонок), у левого — нет
  await expect.poll(() => shades(page, 'Инфраструктура')).toEqual({ start: 0, end: 2 })
  // Тень — у самого правого края видимой части тела и по его высоте
  const edge = await body.evaluate((element) => {
    const view = element.getBoundingClientRect()
    const shade = element
      .closest('section')!
      .querySelectorAll<HTMLElement>('[data-board-shade="end"]')
    const boxes = [...shade].map((e) => e.getBoundingClientRect())
    const own = boxes.find((b) => b.top >= view.top - 1 && b.bottom <= view.bottom + 1)!
    return { right: view.left + element.clientWidth - own.right, height: own.height, width: own.width }
  })
  expect(Math.abs(edge.right)).toBeLessThanOrEqual(1)
  expect(edge.height).toBeGreaterThan(100)
  expect(edge.width).toBeGreaterThanOrEqual(8)

  // 3. Прокрутить вбок до конца (Shift+колесо / тачпад) — справа тени нет, слева есть; обратно в начало — наоборот
  const box = (await body.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 100)
  await page.mouse.wheel(400, 0)
  await expect.poll(() => body.evaluate((e) => e.scrollWidth - e.clientWidth - e.scrollLeft)).toBeLessThanOrEqual(1)
  await expect.poll(() => shades(page, 'Инфраструктура')).toEqual({ start: 2, end: 0 })
  await page.mouse.wheel(-400, 0)
  await expect.poll(() => body.evaluate((e) => e.scrollLeft)).toBe(0)
  await expect.poll(() => shades(page, 'Инфраструктура')).toEqual({ start: 0, end: 2 })

  // 4. «Дежурства» помещается целиком — теней нет
  await loaded(page, 'Дежурства')
  expect(
    await block(page, 'Дежурства')
      .locator('[data-board-body]')
      .evaluate((e) => e.scrollWidth - e.clientWidth),
  ).toBeLessThanOrEqual(1)
  expect(await shades(page, 'Дежурства')).toEqual({ start: 0, end: 0 })
})
