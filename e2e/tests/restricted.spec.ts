import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Режим «только свои карточки» (ADR-0008): чужой карточки для пользователя не существует —
 * ни на доске, ни в счётчике колонки, ни по прямой ссылке.
 */
test.use({ storageState: authFile('e2e-restricted@selen.test') })

test('пользователь с ограничением видит только свою карточку', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')

  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  await expect(todo.getByRole('button', { name: 'Открыть QA-2: Задача подрядчика' })).toBeVisible()
  await expect(page.getByText('Существующая задача')).toHaveCount(0)
  // Счётчик колонки считает только видимые карточки
  await expect(page.getByTitle(/^1 карт/)).toBeVisible()

  await page.goto('/cards/QA-1')
  await expect(page.getByText('Карточка не найдена')).toBeVisible()
  await expect(page.getByText('Существующая задача')).toHaveCount(0)

  // Своя карточка открывается, в ней видно, что он ответственный
  await page.goto('/cards/QA-2')
  const panel = page.getByRole('dialog')
  // Окно карточки (UI-1a): ответственный — строка «Основных параметров»
  const responsible = panel.locator('dt', { hasText: 'Ответственный' }).locator('xpath=following-sibling::dd')
  await expect(responsible).toContainText('E2E Подрядчик')
})
