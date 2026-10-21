import { expect, test } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, loaded, PRODUCT } from '../stage-layout/rows'

/**
 * ТК-UI1.1: карточка открывается большим окном (около 770 px) по центру, у верха экрана, поверх доски; адрес
 * `…/spaces/KEY/cards/KEY-N`; узкой панели справа нет. «Разработка» → «Продукт» демо-данных → RACC «Приёмка рядов» →
 * «Продукт» (E2eSeeder; карточек в In Progress там нет — карточка из To Do); Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.1. Карточка открывается большим окном поверх доски @tc-UI1.1', async ({ page }) => {
  // 1. Дерево → «Приёмка рядов» → доска «Продукт»
  await openHome(page)
  await openSpaceBoard(page, 'Приёмка рядов', PRODUCT)
  await loaded(page, PRODUCT)

  // 2. Щёлкнуть карточку
  await block(page, PRODUCT)
    .getByRole('button', { name: /^Открыть RACC-\d+: Задача продукта 3$/ })
    .click()
  const window = page.getByRole('dialog', { name: 'Задача продукта 3' })
  await expect(window).toBeVisible()

  // Адрес — …/spaces/RACC/cards/RACC-N
  await expect(page).toHaveURL(/\/spaces\/RACC\/cards\/RACC-\d+$/)

  // Окно около 770 px шириной, по центру экрана, у верха
  const viewport = page.viewportSize()!
  const box = (await window.boundingBox())!
  expect(box.width).toBeGreaterThan(700)
  expect(box.width).toBeLessThanOrEqual(800)
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
  expect(box.y).toBeGreaterThan(0)
  expect(box.y).toBeLessThanOrEqual(40)

  // Узкой панели справа нет: справа от окна — доска под затемнением (не окно и не сама доска поверх)
  expect(box.x + box.width).toBeLessThan(viewport.width - 200)
  const sides = await page.evaluate(
    ({ left, right, y }) =>
      [left, right].map((x) => {
        const hit = document.elementFromPoint(x, y)!
        const canvas = document.querySelector('[data-board-canvas]')!
        const under = canvas.getBoundingClientRect()
        return {
          overlay: !hit.closest('[data-card-window]') && !canvas.contains(hit),
          boardUnder: x >= under.left && x <= under.right,
        }
      }),
    { left: box.x - 60, right: box.x + box.width + 60, y: box.y + 300 },
  )
  expect(sides).toEqual([
    { overlay: true, boardUnder: true },
    { overlay: true, boardUnder: true },
  ])
})
