import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { ACTIONS_ONLY_OWNER, openUsers, userRow } from './helpers'

test.use({ storageState: authFile('e2e-admin@selen.test') })

test('ТК-3.24. Обычный администратор ничего не может сделать с Владельцем @tc-3.24', async ({ page }) => {
  await openUsers(page)

  // 2. Строка Владельца: без «⋯», только значок ключа с подсказкой
  const owner = userRow(page, 'E2E Владелец')
  await expect(owner).toBeVisible()
  await expect(owner.getByRole('button', { name: 'Действия с пользователем' })).toHaveCount(0)
  const key = owner.getByTitle(ACTIONS_ONLY_OWNER)
  await expect(key).toBeVisible()
  await key.hover()

  // 3. «⋯» у участника: «Деактивировать» есть, «Сделать администратором» — нет
  await userRow(page, 'E2E Редактор').getByRole('button', { name: 'Действия с пользователем' }).click()
  await expect(page.getByRole('menuitem', { name: 'Деактивировать' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Сделать администратором' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Кнопки «Передать владение» на странице нет
  await expect(page.getByRole('button', { name: 'Передать владение' })).toHaveCount(0)
})
