import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, loaded } from '../stage-layout/rows'
import { DESKTOP } from './helpers'

/**
 * ТК-L74.5 (U-3 UX-ревью LATER-81, дополнение PM 21.10): Tab на карточку последней колонки Done, которая видна не
 * целиком, — тело доски само сдвигается вбок: карточка и рамка фокуса видны целиком; страница (панель, дерево) вбок
 * не сдвигается. «Разработка» → «Инфраструктура» → RACC «Приёмка рядов» → «Инфраструктура» (E2eSeeder: 4 колонки —
 * при 1280 px с деревом шире видимой части, карточка «Инфраструктура: Done» в Done), Анна → e2e-editor. Только смотрим.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

const BOARD = 'Инфраструктура'

/** Карточка относительно видимой части тела доски; прокрутки тела, холста, окна; положение дерева. */
function geometry(page: Page) {
  return page.evaluate((board) => {
    const section = document.querySelector(`section[aria-label="${board}"]`)!
    const body = section.querySelector<HTMLElement>('[data-board-body]')!
    const card = [...body.querySelectorAll('[aria-label]')].find((e) =>
      /^Открыть RACC-\d+: Инфраструктура: Done$/.test(e.getAttribute('aria-label') ?? ''),
    )!
    const view = body.getBoundingClientRect()
    const box = card.getBoundingClientRect()
    return {
      left: box.left - view.left,
      right: view.left + body.clientWidth - box.right,
      body: body.scrollLeft,
      canvas: document.querySelector('[data-board-canvas]')!.scrollLeft,
      window: window.scrollX,
      pageWidth: document.documentElement.scrollWidth,
      tree: document.querySelector('nav[aria-label="Дерево"]')!.getBoundingClientRect().left,
      panel: document.querySelector('h1')!.getBoundingClientRect().left,
    }
  }, BOARD)
}

test('ТК-L74.5. Tab на карточку у края доски — карточка видна целиком @tc-L74.5', async ({ page }) => {
  // 1. Дерево → пространство → «Инфраструктура»
  await openHome(page)
  await openSpaceBoard(page, 'Приёмка рядов', BOARD)
  await loaded(page, BOARD)
  const card = block(page, BOARD).getByRole('button', { name: /^Открыть RACC-\d+: Инфраструктура: Done$/ })
  await expect(card).toBeVisible()

  // Карточка Done видна не целиком: правая часть — за краем видимой части тела доски
  const before = await geometry(page)
  expect(before.body).toBe(0)
  expect(before.right).toBeLessThan(0)

  // 2. Tab по карточкам — до карточки Done (с «+ Карточка» колонки Review — последнего, что перед ней в порядке Tab)
  await block(page, BOARD).getByRole('button', { name: 'Добавить карточку в Review', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(card).toBeFocused()

  // Тело доски сдвинулось: карточка и рамка фокуса (2 px) — целиком в видимой части; страница вбок не сдвинулась
  await expect.poll(async () => (await geometry(page)).right).toBeGreaterThanOrEqual(2)
  const after = await geometry(page)
  expect(after.left).toBeGreaterThanOrEqual(2)
  expect(after.body).toBeGreaterThan(0)
  expect(after.canvas).toBe(0)
  expect(after.window).toBe(0)
  expect(after.pageWidth).toBe(DESKTOP.width)
  expect(after.tree).toBe(before.tree)
  expect(after.panel).toBe(before.panel)
})
