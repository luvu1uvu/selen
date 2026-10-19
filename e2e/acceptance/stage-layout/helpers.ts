import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Общие шаги приёмочных автотестов PR 1 пакета «Раскладка» (LATER-4, LATER-50; docs/stages/layout-package.md,
 * ТК-L50.*). Прокрутка в приложении — не у окна, а у холста страницы доски (вертикаль) и тела доски (вбок), ADR-0019:
 * мерить её надо у этих контейнеров.
 *
 * Данные E2eSeeder, пространство «Раскладка» (LAYOUT): «Длинная доска» — 8 колонок, 30 карточек в To Do (только
 * читаем: её же ждёт нетронутой board-layout.spec); «Доска переносов» — такая же, её карточки тесты переносят и
 * добавляют; «Широкая доска» — 14 колонок без карточек.
 */

/** Ноутбук из предусловий тест-кейсов. */
export const LAPTOP = { width: 1440, height: 900 }

/** Положения прокруток: холст (вертикаль), тело доски, заголовки колонок и полоса (вбок), окно. */
export function scrolls(page: Page) {
  return page.evaluate(() => {
    const q = (selector: string) => document.querySelector(selector)!
    const body = q('[data-board-body]')
    const canvas = q('[data-board-canvas]')
    return {
      canvas: canvas.scrollTop,
      canvasMax: canvas.scrollHeight - canvas.clientHeight,
      body: body.scrollLeft,
      bodyMax: body.scrollWidth - body.clientWidth,
      header: q('[data-board-columns]').scrollLeft,
      bar: q('[data-board-scrollbar]').scrollLeft,
      window: [window.scrollX, window.scrollY],
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
    }
  })
}

/** Элемент виден и ничем не перекрыт: в его центре — он сам (а не закреплённая шапка или карточка поверх). */
export async function expectOnTop(locator: Locator) {
  await expect(locator).toBeInViewport()
  const onTop = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return hit !== null && (element === hit || element.contains(hit))
  })
  expect(onTop).toBe(true)
}

/** Колесо (или жест тачпада) над центром элемента. */
export async function wheelOver(page: Page, locator: Locator, dx: number, dy: number) {
  const box = (await locator.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(dx, dy)
}

/** Колесо над холстом доски — в видимой точке (центр высокой ячейки может быть далеко за краем окна). */
export async function wheelCanvas(page: Page, dy: number) {
  const box = (await page.locator('[data-board-canvas]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6)
  await page.mouse.wheel(0, dy)
}

/**
 * Заголовок каждой колонки — ровно над своей колонкой: для каждой ячейки (role=group с названием колонки) —
 * сдвиг названия в строке заголовков относительно левого края ячейки. У всех колонок он одинаковый и небольшой
 * (отступ внутри заголовка); разъехавшиеся заголовки дали бы сдвиг на величину прокрутки.
 */
export function headerOffsets(page: Page, columns: string[]) {
  return page.evaluate((names) => {
    const header = document.querySelector('[data-board-columns]')!
    return names.map((name) => {
      const cell = document.querySelector(`[role="group"][aria-label="${name}"]`)!
      const title = [...header.querySelectorAll('*')].find(
        (e) => e.children.length === 0 && e.textContent === name,
      )!
      return Math.round(title.getBoundingClientRect().left - cell.getBoundingClientRect().left)
    })
  }, columns)
}

export async function expectHeadersAligned(page: Page, columns: string[]) {
  const offsets = await headerOffsets(page, columns)
  for (const offset of offsets) {
    expect(Math.abs(offset - offsets[0])).toBeLessThanOrEqual(1)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThan(40)
  }
}

/** Колонки шаблона «Разработка» («Длинная доска», «Доска переносов»). */
export const DEV_COLUMNS = [
  'Backlog',
  'To Do',
  'In Progress',
  'Code Review',
  'Ready for Testing',
  'Testing',
  'Ready for Merge',
  'Done',
]

/** Карточки ячейки — кнопки «Открыть KEY: название». */
export function cardsIn(page: Page, column: string) {
  return page
    .getByRole('group', { name: column, exact: true })
    .getByRole('button', { name: /^Открыть [A-Z]+-\d+: / })
}

/** Сбой страницы доски — экран «Что-то пошло не так» вместо доски. */
export async function expectNoCrash(page: Page) {
  await expect(page.getByText('Что-то пошло не так')).toHaveCount(0)
}
