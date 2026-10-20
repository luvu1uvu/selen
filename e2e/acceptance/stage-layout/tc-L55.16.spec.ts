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
  START_LAYOUT,
  WIDE,
} from './rows'

/**
 * ТК-L55.16 (LATER-55, дополнение PM 19.10): доска в другой ряд и отдельным рядом; раскладка общая для всех
 * участников. «Инфраструктура» за ⠿ над правой половиной шапки «Продукта» — встаёт в его ряд справа, пустого ряда на
 * её прежнем месте нет; у Бориса та же раскладка; в сером промежутке между рядами, пока кнопка зажата, —
 * горизонтальная линия, после отпускания «Инфраструктура» — отдельным рядом между первым рядом и «Продуктом»; меню
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

  // 1. «Инфраструктура» за ⠿ — над правой половиной шапки «Продукта». Холст — до конца вниз: обе шапки посередине
  // экрана, не у краёв, где dnd-kit прокручивает холст сам
  await toBottom(page)
  await loaded(page, PRODUCT)
  await loaded(page, INFRA)
  await toBottom(page)
  await grabBoard(page, INFRA, await overHeader(page, PRODUCT, 'right'))
  await expect(page.locator('[data-board-drop="row"]')).toBeVisible()
  await dropBoard(page)
  // «Инфраструктура» — в одном ряду с «Продуктом», справа; в промежутке, где она была, ничего не осталось
  const moved = [[DUTY, WIDE], [PRODUCT, INFRA]]
  await expect.poll(() => layout(page)).toEqual(moved)
  await expect(page.locator('[data-board-row]')).toHaveCount(2)

  // 2. Во втором браузере Борис открывает пространство — та же раскладка
  const boris = await pageAs(browser, 'e2e-editor@selen.test')
  await openSpace(boris, ...SPACE)
  await expect.poll(() => layout(boris)).toEqual(moved)
  await boris.context().close()

  // 3. «Инфраструктура» за ⠿ — в сером промежутке между первым рядом и «Продуктом»
  await toBottom(page)
  const [first, second] = await rows(page)
  const gap = { x: first.left + 200, y: (first.bottom + second.top) / 2 }
  expect(second.top - first.bottom).toBeGreaterThan(4)
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
