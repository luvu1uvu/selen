import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { cardsIn, expectOnTop, LAPTOP, scrolls, wheelCanvas } from './helpers'

/**
 * ТК-L50.2 (LATER-50, п. 2): на длинной доске при прокрутке вниз шапка доски («Пространство / Доска» и «⋯») и строка
 * заголовков колонок (название, число карточек, тип, «+», у администратора — «⋯») остаются вверху; карточки уезжают
 * под заголовки. Доска «Продукт» → «Длинная доска» (E2eSeeder), администратор пространства — e2e-admin.
 * Тип колонки — точка с подсказкой вместо текстового бейджа (LATER-77, решение PM 20.10).
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

test('ТК-L50.2. Шапка доски и заголовки колонок видны при прокрутке @tc-L50.2', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  const board = page.getByRole('region', { name: 'Длинная доска' })
  const first = cardsIn(page, 'To Do').first()
  await expect(first).toBeInViewport()

  // Прокрутить колесом вниз на несколько экранов
  await wheelCanvas(page, 1500)
  await wheelCanvas(page, 1000)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)
  await expect(first).not.toBeInViewport()

  // Шапка доски: «Раскладка / Длинная доска» и «⋯» справа; окно не прокручено
  expect((await scrolls(page)).window).toEqual([0, 0])
  await expectOnTop(board.getByRole('link', { name: 'Раскладка', exact: true }))
  await expectOnTop(board.getByRole('heading', { name: 'Длинная доска' }))
  await expectOnTop(board.getByRole('button', { name: 'Действия с доской' }))

  // Заголовки колонок: название, число карточек, тип, «+», «⋯» (администратор)
  const add = page.getByRole('button', { name: 'Добавить карточку в начало To Do' })
  // Заголовок колонки To Do — самый внутренний блок строки заголовков, где есть и её «+», и тип (точка «Очередь»)
  const queue = page.getByRole('img', { name: 'Очередь', exact: true })
  const todo = page.locator('[data-board-columns] div').filter({ has: add }).filter({ has: queue }).last()
  await expectOnTop(todo.getByText('To Do', { exact: true }))
  // Число карточек (board-layout.spec в общем прогоне переносит одну из To Do — само число не сверяем)
  await expectOnTop(todo.getByText(/^\d+$/))
  await expectOnTop(todo.getByRole('img', { name: 'Очередь', exact: true }))
  await expectOnTop(add)
  await expectOnTop(page.getByRole('button', { name: 'Действия с колонкой «To Do»' }))

  // Карточки — под заголовками: там, где колонка To Do уходит под строку заголовков, сверху — заголовки
  const underHeader = await page.evaluate(() => {
    const row = document.querySelector('[data-board-columns]')!.getBoundingClientRect()
    const cell = document.querySelector('[role="group"][aria-label="To Do"]')!.getBoundingClientRect()
    const x = cell.left + cell.width / 2
    const y = row.top + row.height / 2
    const hit = document.elementFromPoint(x, y)
    return {
      cellStartsAbove: cell.top < row.top,
      headerOnTop: hit !== null && hit.closest('[data-board-columns]') !== null,
      cardOnTop: hit !== null && hit.closest('[aria-label^="Открыть "]') !== null,
    }
  })
  expect(underHeader).toEqual({ cellStartsAbove: true, headerOnTop: true, cardOnTop: false })
})
