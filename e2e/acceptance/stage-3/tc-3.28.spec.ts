import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openUsers, roleCell, submitTransfer } from './helpers'

test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-3.28. Неверный пароль при передаче владения @tc-3.28', async ({ page }) => {
  await openUsers(page)

  // 1–2. Неверный пароль: ошибка под полем, диалог открыт
  const dialog = await submitTransfer(page, 'E2E Адм', 'E2E Администратор', 'wrong-password')
  await expect(dialog.getByText('Неверный пароль.')).toBeVisible()
  await expect(dialog).toBeVisible()

  // 3. Закрыть диалог: Владелец прежний
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
  await expect(roleCell(page, 'E2E Владелец')).toHaveText('Владелец')
  await expect(roleCell(page, 'E2E Администратор')).toHaveText('Администратор')
})
