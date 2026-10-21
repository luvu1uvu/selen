import { expect, test, type Page } from '@playwright/test'
import { authFile, pageAs } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import {
  arrange,
  DUTY,
  dropBoard,
  grabBoard,
  INFRA,
  layout,
  loaded,
  openSpace,
  overHeader,
  PRODUCT,
  rect,
  START_LAYOUT,
  WIDE,
} from './rows'

/**
 * ТК-L55.16 (LATER-55, дополнение PM 19.10; ответы PM 21.10 — ряд виден по зазору, линия броска — где доска встанет):
 * доска в другой ряд и отдельным рядом; раскладка общая для всех участников. Между рядами зазор больше (24 px), чем
 * между строками одного ряда (12 px). «Инфраструктура» за ⠿ над правой половиной шапки «Продукта» — рядом с ним не
 * помещается: пока кнопка зажата — горизонтальная линия под «Продуктом», после отпускания «Инфраструктура» — в его ряду
 * строкой ниже, пустого ряда на её прежнем месте нет; у Бориса та же раскладка; в сером промежутке между рядами — линия
 * во всю ширину, после отпускания «Инфраструктура» — отдельным рядом между первым рядом и «Продуктом»; меню
 * «Переставить» → «В ряд ниже», затем «Отдельным рядом» возвращают раскладку. «Разработка» демо-данных → RNEWROW
 * «Новый ряд приёмки» (E2eSeeder), Анна → e2e-admin, Борис → e2e-editor.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RNEWROW', 'Новый ряд приёмки'] as const

/** Холст — до конца вниз. */
async function toBottom(page: Page) {
  await page.locator('[data-board-canvas]').evaluate((canvas) => (canvas.scrollTop = canvas.scrollHeight))
}

function rows(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-board-row]')].map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }
    }),
  )
}

test('ТК-L55.16. Доска в другой ряд и отдельным рядом; раскладку видят все @tc-L55.16', async ({ page, browser }) => {
  await openSpace(page, ...SPACE)
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
  await loaded(page, DUTY)
  // Ряд виден: «Широкая доска» — строкой ниже «Дежурства» в том же ряду (зазор 12 px), «Продукт» — следующий ряд (24 px)
  expect(Math.round((await rect(page, WIDE)).top - (await rect(page, DUTY)).bottom)).toBe(12)
  await loaded(page, WIDE)
  await toBottom(page)
  await loaded(page, PRODUCT)
  expect(Math.round((await rect(page, PRODUCT)).top - (await rect(page, WIDE)).bottom)).toBe(24)

  // 1. «Инфраструктура» за ⠿ — над правой половиной шапки «Продукта». Холст — до конца вниз: обе шапки посередине
  // экрана, не у краёв, где dnd-kit прокручивает холст сам
  await toBottom(page)
  await loaded(page, PRODUCT)
  await loaded(page, INFRA)
  await toBottom(page)
  await grabBoard(page, INFRA, await overHeader(page, PRODUCT, 'right'))
  await expect(page.locator('[data-board-drop="row"]')).toBeVisible()
  // Рядом с «Продуктом» (он шире экрана) не поместится — линия горизонтальная, под «Продуктом»: там доска и встанет
  const product = await rect(page, PRODUCT)
  const below = await page.locator('[data-board-drop]').evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { y: box.top + box.height / 2, left: box.left, width: box.width, height: box.height }
  })
  expect(below.width).toBeGreaterThan(below.height * 20)
  expect(below.y).toBeGreaterThan(product.bottom)
  expect(below.y).toBeLessThan(product.bottom + 12)
  expect(Math.abs(below.left - product.left)).toBeLessThanOrEqual(2)
  await dropBoard(page)
  // «Инфраструктура» — в одном ряду с «Продуктом», строкой ниже; в промежутке, где она была, ничего не осталось
  const moved = [[DUTY, WIDE], [PRODUCT, INFRA]]
  await expect.poll(() => layout(page)).toEqual(moved)
  await expect(page.locator('[data-board-row]')).toHaveCount(2)
  expect(Math.round((await rect(page, INFRA)).top - (await rect(page, PRODUCT)).bottom)).toBe(12)

  // 2. Во втором браузере Борис открывает пространство — та же раскладка
  const boris = await pageAs(browser, 'e2e-editor@selen.test')
  await openSpace(boris, ...SPACE)
  await expect.poll(() => layout(boris)).toEqual(moved)
  await boris.context().close()

  // 3. «Инфраструктура» за ⠿ — в сером промежутке между первым рядом и «Продуктом»
  await toBottom(page)
  const [first, second] = await rows(page)
  const gap = { x: first.left + 200, y: (first.bottom + second.top) / 2 }
  expect(Math.round(second.top - first.bottom)).toBe(24)
  await grabBoard(page, INFRA, gap)
  // Пока кнопка зажата — горизонтальная линия в промежутке между рядами, доски не перестраиваются
  const line = await page.locator('[data-board-drop]').evaluate((el) => {
    const box = el.getBoundingClientRect()
    return { kind: el.getAttribute('data-board-drop'), y: box.top + box.height / 2, width: box.width, height: box.height }
  })
  expect(line.kind).toBe('newRow')
  expect(line.width).toBeGreaterThan(line.height * 20)
  expect(line.y).toBeGreaterThanOrEqual(first.bottom - 2)
  expect(line.y).toBeLessThanOrEqual(second.top + 2)
  expect(await layout(page)).toEqual(moved)
  await dropBoard(page)
  // «Инфраструктура» — отдельным рядом между первым рядом и «Продуктом»
  await expect.poll(() => layout(page)).toEqual([[DUTY, WIDE], [INFRA], [PRODUCT]])

  // 4. Вернуть: «⋯» → «Переставить» → «В ряд ниже», затем «Отдельным рядом»
  await arrange(page, INFRA, 'В ряд ниже')
  await expect.poll(() => layout(page)).toEqual(moved)
  await arrange(page, INFRA, 'Отдельным рядом')
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
})
