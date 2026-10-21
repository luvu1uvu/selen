import { expect, test } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Блокировка карточкой (ADR-0011): видна на фасаде, снимается сама, когда блокирующая карточка
 * переходит в Done; эпизод остаётся в истории и в ленте. Архив карточек: поиск и восстановление.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('блокировка карточкой снимается автоматически; лента истории; архив карточек', async ({ page }) => {
  // QA-1 блокирует QA-3 — выбор через поиск по названию
  // Окно карточки (UI-1a): новая блокировка — пунктом «+», форма и активная блокировка — под рядом действий
  await page.goto('/cards/QA-1')
  const blocks = page.getByRole('dialog')
  await blocks.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Блокировку…' }).click()
  await blocks.getByRole('button', { name: 'Выбрать блокирующую карточку' }).click()
  await blocks.getByLabel('Найти блокирующую карточку').fill('блокирующая')
  await blocks.getByRole('button', { name: /QA-3/ }).click()
  await blocks.getByRole('button', { name: 'Заблокировать' }).click()
  await expect(blocks.getByRole('link', { name: 'QA-3' })).toBeVisible()
  await expect(blocks.getByRole('button', { name: 'Снять' })).toBeVisible()

  // На доске QA-1 выделена
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Открыть QA-1:/ })).toContainText('Заблокирована')

  // QA-3 → Done через диалог перемещения
  await page.goto('/cards/QA-3')
  await page.getByRole('dialog').getByRole('button', { name: /^Действия с карточкой/ }).click()
  await page.getByRole('menuitem', { name: 'Переместить…' }).click()
  const move = page.getByRole('dialog', { name: 'Переместить QA-3' })
  await move.getByLabel('Колонка').selectOption({ label: 'Done' })
  await move.getByRole('button', { name: 'Переместить' }).click()
  await expect(page.getByText('Карточка перемещена')).toBeVisible()

  // Блокировка QA-1 снята сама, эпизод — в истории блокировок и в ленте
  await page.goto('/cards/QA-1')
  const panel = page.getByRole('dialog')
  // Активной блокировки нет, снятая — в секции «Блокировки»; лента — вкладка «История»
  await expect(panel.getByRole('button', { name: 'Снять' })).toHaveCount(0)
  await expect(panel.getByRole('region', { name: 'Блокировки' }).getByText(/снята автоматически/)).toBeVisible()
  await panel.getByRole('tab', { name: 'История' }).click()
  const history = panel.getByRole('tabpanel', { name: 'История' })
  await expect(history.getByText('Блокировка снята автоматически: QA-3 «Блокирующая задача» готова')).toBeVisible()
  await expect(history.getByText('Блокирует: QA-3 «Блокирующая задача»')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Открыть QA-1:/ })).not.toContainText('Заблокирована')

  // Архив: найти по номеру и восстановить
  // Архив карточек — в меню «⋯» доски (ADR-0019)
  await page.getByRole('button', { name: 'Действия с доской' }).click()
  await page.getByRole('menuitem', { name: 'Архив карточек' }).click()
  const archive = page.getByRole('dialog', { name: 'Архив карточек' })
  await archive.getByLabel('Поиск по номеру или названию').fill('QA-4')
  await expect(archive.getByText('Устаревшая задача')).toBeVisible()
  await archive.getByRole('button', { name: 'Восстановить' }).click()
  await expect(page.getByText('Карточка восстановлена')).toBeVisible()
  await expect(archive.getByText('Ничего не найдено')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Открыть QA-4: Устаревшая задача' })).toBeVisible()
})
