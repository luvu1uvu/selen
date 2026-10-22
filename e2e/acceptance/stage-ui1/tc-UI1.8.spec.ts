import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, param, tile } from './helpers'

/**
 * ТК-UI1.8: место карточки меняется там же, где его видно, — «Расположение» → лупа «Переместить…» → колонка →
 * «Переместить»; «Расположение» и бейдж категории обновились, под названием «Перемещена только что», на доске
 * карточка в новой колонке. Карточка из To Do «Продукта» → WIN-4 «Переносится в работу» (E2eSeeder); Анна →
 * e2e-editor.
 *
 * После переноса окно должно закрываться первым Esc; сейчас первый Esc закрывает подсказку лупы (LATER-94) — проверка
 * мягкая: тест падает до исправления, остальное проверяется.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.8. Перенос в другое место из «Расположения» @tc-UI1.8', async ({ page }) => {
  // 1. Открыть карточку в колонке To Do
  const window = await openCard(page, 'Переносится в работу')
  const location = param(window, 'Расположение')
  await expect(location).toContainText('Окно / To Do')
  await expect(window.locator('time').filter({ hasText: /^Перемещена/ })).toHaveCount(0)

  // 2. «Расположение» → значок-лупа «Переместить…» → In Progress → «Переместить»
  await location.getByRole('button', { name: 'Переместить…' }).click()
  const move = page.getByRole('dialog', { name: /^Переместить WIN-\d+$/ })
  await expect(move).toBeVisible()
  await move.getByLabel('Колонка').selectOption({ label: 'In Progress' })
  await move.getByRole('button', { name: 'Переместить' }).click()
  await expect(page.getByText('Карточка перемещена')).toBeVisible()
  await expect(move).toBeHidden()

  // «Расположение» — «Окно / In Progress (…)», бейдж «В работе»; под названием — «Перемещена только что»
  await expect(location).toContainText('Окно / In Progress')
  await expect(location).toContainText('В работе')
  await expect(window.locator('time').filter({ hasText: /^Перемещена/ })).toHaveText(
    'Перемещена только что',
  )

  // На доске карточка — в колонке In Progress. Окно закрывается одним Esc: после окна «Переместить» фокус вернулся на
  // лупу, и её подсказка не должна висеть и перехватывать Esc (сейчас перехватывает, LATER-94 — проверка мягкая)
  await page.keyboard.press('Escape')
  await expect.soft(window, 'окно закрылось первым Esc').toBeHidden({ timeout: 2000 })
  if (await window.isVisible()) await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tile(page, 'Переносится в работу')).toBeVisible()
  await expect(
    page
      .getByRole('group', { name: 'In Progress', exact: true })
      .locator('[aria-label$=": Переносится в работу"]'),
  ).toBeVisible()
})
