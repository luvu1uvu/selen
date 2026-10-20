import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { LAPTOP } from './helpers'

/**
 * ТК-L55.2 (LATER-55, шаг 1): на доске с одной дорожкой под заголовками колонок сразу карточки — полосы с названием
 * дорожки и стрелкой нет. «Инфраструктура» (одна дорожка) → «Плотная доска» пространства «Сквозные тесты»
 * (E2eSeeder: шаблон «Простой», одна дорожка «Основная», карточки в To Do и In Progress).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: LAPTOP })

test('ТК-L55.2. Одна дорожка — без строки @tc-L55.2', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
  const board = page.getByRole('region', { name: 'Плотная доска' })
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  // Карточки To Do (их число не важно: board.spec переносит одну из них в In Progress)
  await expect(todo.getByRole('button', { name: /^Открыть QA-\d+: / }).first()).toBeVisible()

  // Полосы дорожки нет: ни строки, ни названия «Основная», ни стрелки и счётчика дорожки
  await expect(board.locator('[data-lane-row]')).toHaveCount(0)
  await expect(board.getByText('Основная', { exact: true })).toHaveCount(0)
  await expect(board.getByRole('button', { name: /дорожку/ })).toHaveCount(0)
  await expect(board.getByRole('button', { name: /^Действия с дорожкой/ })).toHaveCount(0)

  // Под заголовками колонок сразу ячейки с карточками
  const header = (await page.locator('[data-board-columns]').boundingBox())!
  const cells = page.locator('[data-board-body] [role="group"]')
  await expect(cells).toHaveCount(4)
  for (const box of await cells.evaluateAll((all) => all.map((c) => c.getBoundingClientRect().top))) {
    expect(Math.abs(box - (header.y + header.height))).toBeLessThanOrEqual(2)
  }
  const firstCard = (await todo.getByRole('button', { name: /^Открыть QA-\d+: / }).first().boundingBox())!
  expect(firstCard.y - (header.y + header.height)).toBeLessThan(24)
})
