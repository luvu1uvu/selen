import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { openUsers } from './helpers'

const OWNER_ONLY_HINT = 'Назначить администратора может только Владелец.'

async function openInvite(page: Page) {
  await openUsers(page)
  await page.getByRole('button', { name: 'Пригласить' }).click()
  return page.getByRole('dialog', { name: 'Пригласить пользователя' })
}

test('ТК-3.25. Обычный администратор приглашает только участника @tc-3.25', async ({ browser }) => {
  // 1–2. Обычный администратор: в «Роль» только «Участник» и подсказка
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  const adminDialog = await openInvite(adminPage)
  await expect(adminDialog.getByLabel('Роль').locator('option')).toHaveText(['Участник'])
  await expect(adminDialog.getByText(OWNER_ONLY_HINT)).toBeVisible()
  await adminDialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(adminDialog).toBeHidden()

  // 3. Владелец: «Участник» и «Администратор», подсказки нет
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  const ownerDialog = await openInvite(ownerPage)
  await expect(ownerDialog.getByLabel('Роль').locator('option')).toHaveText(['Участник', 'Администратор'])
  await expect(ownerDialog.getByText(OWNER_ONLY_HINT)).toHaveCount(0)
})
