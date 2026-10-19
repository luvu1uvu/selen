import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { ACTIONS_ONLY_OWNER, openUsers, roleCell, userRow } from './helpers'

// Вместо «Бориса Петрова» — «E2E Кандидат» из E2eSeeder: в систему не входит, роль возвращается в конце теста
const CANDIDATE = 'E2E Кандидат'

test('ТК-3.26. Владелец назначает и снимает администратора @tc-3.26', async ({ browser }) => {
  const ownerPage = await pageAs(browser, 'e2e-owner@selen.test')
  await openUsers(ownerPage)
  await expect(roleCell(ownerPage, CANDIDATE)).toHaveText('Участник')

  // 1. Владелец: «⋯» → «Сделать администратором»
  await userRow(ownerPage, CANDIDATE).getByRole('button', { name: 'Действия с пользователем' }).click()
  await ownerPage.getByRole('menuitem', { name: 'Сделать администратором' }).click()
  await expect(ownerPage.getByText('Роль изменена')).toBeVisible()
  await expect(roleCell(ownerPage, CANDIDATE)).toHaveText('Администратор')

  // 2. Обычный администратор: в строке нового администратора нет «⋯», только значок ключа
  const adminPage = await pageAs(browser, 'e2e-admin@selen.test')
  await openUsers(adminPage)
  const row = userRow(adminPage, CANDIDATE)
  await expect(roleCell(adminPage, CANDIDATE)).toHaveText('Администратор')
  await expect(row.getByRole('button', { name: 'Действия с пользователем' })).toHaveCount(0)
  await expect(row.getByTitle(ACTIONS_ONLY_OWNER)).toBeVisible()

  // 3. Владелец: «⋯» → «Сделать участником»
  await userRow(ownerPage, CANDIDATE).getByRole('button', { name: 'Действия с пользователем' }).click()
  await ownerPage.getByRole('menuitem', { name: 'Сделать участником' }).click()
  await expect(roleCell(ownerPage, CANDIDATE)).toHaveText('Участник')
})
