import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { adminRail, openAdminPanel, openCompanyUsers, usersTabs } from './helpers'

/**
 * ТК-R2.25: права «по умолчанию для новых» задаются группе «Все сотрудники» (решение PM 28.10, п. 7). admin@ →
 * e2e-admin, zhanna@ → e2e-editor (участник «Компании 1» без прав в админке). Право выдаётся на время проверки
 * и снимается — тест можно повторить.
 */

/** «Пользователи» → «Группы» → «Все сотрудники» → галочка «Журнал событий» в «Правах компании». */
async function eventLogRight(admin: Page) {
  await openCompanyUsers(admin)
  await usersTabs(admin).getByRole('link', { name: 'Группы' }).click()
  await admin.getByRole('link', { name: 'Все сотрудники', exact: true }).click()
  await expect(admin.getByRole('heading', { name: 'Все сотрудники' })).toBeVisible()
  return admin.getByRole('region', { name: 'Права компании' }).getByRole('checkbox', { name: /^Журнал событий/ })
}

test('ТК-R2.25. Права компании группе «Все сотрудники» — у каждого сотрудника @tc-R2.25', async ({ browser }) => {
  // До проверки «Администрирования» у сотрудника нет
  const employee = await pageAs(browser, 'e2e-editor@selen.test')
  await expect(adminRail(employee)).toHaveCount(0)

  // 1. Администратор: «Все сотрудники» → «Права компании»: отметить «Журнал событий»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  const right = await eventLogRight(admin)
  await expect(right).not.toBeChecked()
  await right.click()
  await expect(admin.getByText('Права сохранены')).toBeVisible()
  await expect(right).toBeChecked()

  // 2. Сотрудник: в меню «Администрирования» только «Журнал событий», журнал открывается
  await employee.reload()
  const panel = await openAdminPanel(employee)
  await expect(panel.getByRole('link')).toHaveText(['Журнал событий'])
  await panel.getByRole('link', { name: 'Журнал событий', exact: true }).click()
  await expect(employee.getByRole('heading', { name: 'Журнал событий', level: 1 })).toBeVisible()
  await expect(employee.getByRole('columnheader', { name: 'Событие' })).toBeVisible()
  await expect(employee.getByRole('main').getByRole('row').nth(1)).toBeVisible()

  // 3. Администратор снимает галочку — у сотрудника «Администрирования» нет
  await right.click()
  await expect(admin.getByText('Права сохранены').last()).toBeVisible()
  await expect(right).not.toBeChecked()
  await employee.goto('/')
  await expect(employee.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await expect(adminRail(employee)).toHaveCount(0)
})
