import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { loaded, rect } from '../stage-layout/rows'
import { LAPTOP } from './helpers'

/**
 * ТК-L74.4 (решение PM 20.10, п. 3): доска, открытая из дерева, встаёт под панель с отступом около 12 px — над её шапкой
 * только фон холста, без полоски края доски выше. «Разработка» → RFOLD «Сворачивание приёмки» (E2eSeeder: «Продукт»
 * и «Инфраструктура» выше экрана — встают к верху холста, как в демо-данных), Анна → e2e-editor: сворачивание досок
 * личное, у e2e-admin его меняют ТК-L55.14/.18/.23 — так тест от них не зависит. Только смотрим.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

const SPACE = 'Сворачивание приёмки'

/** Над доской: отступ от верха холста, край предыдущей доски, что видно в полосе над шапкой. */
function above(page: Page, board: string) {
  return page.evaluate((board) => {
    const canvas = document.querySelector('[data-board-canvas]')!.getBoundingClientRect()
    const sections = [...document.querySelectorAll('section[data-board-block]')]
    const target = sections.find((s) => s.getAttribute('aria-label') === board)!
    const top = target.getBoundingClientRect().top
    // Доски выше открытой — их нижний край относительно верха холста
    const overlap = Math.max(
      ...sections
        .filter((s) => s !== target && s.getBoundingClientRect().top < top)
        .map((s) => s.getBoundingClientRect().bottom - canvas.top),
    )
    // В полосе между верхом холста и шапкой доски — точки по всей ширине: ни одна не попадает в блок доски
    const hits = []
    for (let y = canvas.top + 1; y < top - 1; y += 2)
      for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const hit = document.elementFromPoint(canvas.left + canvas.width * fx, y)
        hits.push(hit?.closest('section[data-board-block]')?.getAttribute('aria-label') ?? null)
      }
    return { gap: top - canvas.top, overlap, boards: hits.filter((h) => h !== null) }
  }, board)
}

test('ТК-L74.4. Доска из дерева — без полоски соседней доски сверху @tc-L74.4', async ({ page }) => {
  await openHome(page)
  for (const board of ['Продукт', 'Инфраструктура']) {
    // 1. Дерево → пространство → доска
    await openSpaceBoard(page, SPACE, board)
    await loaded(page, board)
    // Холст доехал до доски и остановился: над шапкой — около 12 px
    await expect
      .poll(async () => {
        const before = (await rect(page, board)).top
        await page.waitForTimeout(150)
        const { gap } = await above(page, board)
        return (await rect(page, board)).top === before && Math.abs(gap - 12) <= 1
      })
      .toBe(true)
    // 2. Над шапкой — только фон холста; край доски выше — за верхом холста
    const { overlap, boards } = await above(page, board)
    expect(overlap).toBeLessThanOrEqual(0.5)
    expect(boards).toEqual([])
  }
})
