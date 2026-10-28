import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { ACTIONS_ONLY_OWNER, userRow } from '../stage-3/helpers'
import { openCompanyUsers, userActions } from './helpers'

/**
 * ТК-R2.39: администратор компании меняет email и завершает сеансы участников, но не трогает Владельца и других
 * администраторов. admin@ → e2e-admin (администратор «Компании 1»), «Демо Участник» → «E2E Посторонний», «Демо
 * Владелец» → «E2E Владелец». Тест только открывает меню — данные не меняются.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

test('ТК-R2.39. Кто может менять email и завершать сеансы @tc-R2.39', async ({ page }) => {
  // 1. «Пользователи» → «⋯» у участника: «Изменить email…» и «Завершить все сеансы…»
  await openCompanyUsers(page)
  await userActions(page, 'E2E Посторонний').click()
  await expect(page.getByRole('menuitem', { name: 'Изменить email…' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Завершить все сеансы…' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // 2. Строка Владельца: меню «⋯» нет — только значок «Доступ к пространствам» с подсказкой
  const owner = userRow(page, 'E2E Владелец')
  await expect(userActions(page, 'E2E Владелец')).toHaveCount(0)
  const access = owner.getByRole('link', { name: 'Доступ к пространствам' })
  await expect(access).toBeVisible()
  await access.hover()
  await expect(page.getByRole('tooltip')).toContainText(ACTIONS_ONLY_OWNER)
})
