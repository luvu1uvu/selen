import { expect, type Locator, type Page } from '@playwright/test'
import { openBoard, openHome } from '../../tests/helpers'

/**
 * Общие шаги приёмочных автотестов пакета «Раскладка»: PR 1 (LATER-4, LATER-50; docs/stages/layout-package.md,
 * ТК-L50.*) и PR 2 (LATER-55, ТК-L55.* — в конце файла). Прокрутка в приложении — не у окна, а у холста страницы
 * доски (вертикаль) и тела доски (вбок), ADR-0019: мерить её надо у этих контейнеров.
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

/*
 * PR 2 пакета (LATER-55, ТК-L55.*): дорожки — строки внутри доски, личное сворачивание, сетка колонок. Доска «Продукт»
 * демо-данных → «Дорожки приёмки» пространства «Раскладка» (E2eSeeder): шаблон «Разработка» (шире окна), дорожки
 * «Основная» (3 карточки в To Do), «Срочные» (2 в To Do, 1 в In Progress) и «Плановые» (1 в Backlog). Сворачивание
 * хранится на сервере и у каждого пользователя своё — каждый автотест сначала разворачивает все дорожки сам.
 */
export const LANES_BOARD = 'Дорожки приёмки'
export const LANES = ['Основная', 'Срочные', 'Плановые']

/** Дорожка — блок с её строкой и ячейками; строка — полоса с названием, счётчиком и шевроном. */
export const lane = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
export const laneRow = (page: Page, name: string) => lane(page, name).locator('[data-lane-row]')
export const toggle = (page: Page, name: string, action: 'Свернуть' | 'Развернуть') =>
  lane(page, name).getByRole('button', { name: `${action} дорожку «${name}»` })
export const cell = (page: Page, name: string) => page.getByRole('group', { name, exact: true })

/** Развернуть все свёрнутые дорожки — по одной: следующая, когда эта развернулась (иначе щелчок попал бы в неё же). */
export async function expandAllLanes(page: Page) {
  await expect(page.locator('[data-lane-row]')).toHaveCount(LANES.length)
  const expand = page.getByRole('button', { name: /^Развернуть дорожку/ })
  for (let left = await expand.count(); left > 0; left--) {
    await expand.first().click()
    await expect(expand).toHaveCount(left - 1)
  }
}

/** «Дорожки приёмки» с развёрнутыми дорожками. */
export async function openLanesBoard(page: Page) {
  await openHome(page)
  await openBoard(page, 'Раскладка', LANES_BOARD)
  await expandAllLanes(page)
}

export const center = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/** Плавное движение мыши (с зажатой кнопкой — перенос, как от человека: dnd-kit начинает его после сдвига на 5 px). */
export async function glide(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 20) {
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps)
  }
}

/**
 * Место переносимой карточки в теле доски — кнопка с её названием и пунктирной рамкой: в какой ячейке и где.
 * Переносимая под указателем копия (DragOverlay) — вне тела доски и сюда не попадает.
 */
export function slotOf(page: Page, name: string) {
  return page.evaluate((name) => {
    const slots = [...document.querySelectorAll('[data-board-body] [role="button"], [data-board-body] button')].filter(
      (el) => el.getAttribute('aria-label') === name,
    )
    return slots.map((el) => {
      const box = el.getBoundingClientRect()
      return {
        cell: el.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
        dashed: getComputedStyle(el).outlineStyle === 'dashed',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    })
  }, name)
}

/** Фон ячеек тела доски: подсвеченная — с фоном, остальные — прозрачные. */
export function cellBackgrounds(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-board-body] [role="group"]')].map((c) => [
        c.getAttribute('aria-label'),
        getComputedStyle(c).backgroundColor,
      ]),
    ),
  )
}

export const TRANSPARENT = 'rgba(0, 0, 0, 0)'
