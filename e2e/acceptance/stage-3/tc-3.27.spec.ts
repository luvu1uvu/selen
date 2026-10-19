import { expect, test } from '@playwright/test'
import { PASSWORD, pageAs } from '../../tests/helpers'
import { openUsers, roleCell, submitTransfer } from './helpers'

test('ТК-3.27. Передача владения @tc-3.27', async ({ browser }) => {
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  await openUsers(ownerPage)

  // 1–3. Передать владение «E2E Администратор» (поиск по началу имени)
  const dialog = await submitTransfer(ownerPage, 'E2E Адм', 'E2E Администратор', PASSWORD)
  await expect(ownerPage.getByText('Владение передано: E2E Администратор — новый Владелец')).toBeVisible()
  await expect(dialog).toBeHidden()

  // 4. Без перезахода: кнопки «Передать владение» нет, роли поменялись
  await expect(ownerPage.getByRole('button', { name: 'Передать владение' })).toHaveCount(0)
  await expect(roleCell(ownerPage, 'E2E Администратор')).toHaveText('Владелец')
  await expect(roleCell(ownerPage, 'E2E Владелец')).toHaveText('Администратор')

  // 5. Новый Владелец возвращает владение (состояние для остальных тестов — как было)
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await openUsers(adminPage)
  await submitTransfer(adminPage, 'E2E Влад', 'E2E Владелец', PASSWORD)
  await expect(adminPage.getByText('Владение передано: E2E Владелец — новый Владелец')).toBeVisible()
  await expect(roleCell(adminPage, 'E2E Владелец')).toHaveText('Владелец')
  await expect(roleCell(adminPage, 'E2E Администратор')).toHaveText('Администратор')
})
