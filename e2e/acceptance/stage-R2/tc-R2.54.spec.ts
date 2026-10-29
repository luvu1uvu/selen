import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import {
  closeDialog,
  grantRoles,
  grantRows,
  openCompanyUsers,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
  stamp,
} from './helpers'

/**
 * ТК-R2.54: новому сотруднику можно сразу открыть папку с ролями. admin@ → e2e-admin; «Операции» → «E2E Операции»
 * (E2eSeeder::foldersAccess). Имя и email приглашённого — одноразовые (тест можно повторить). Письмо в Mailpit — только
 * вручную: в стеке E2E письма не отправляются (MAIL_MAILER=log). В конце доступ приглашённого к папке снимается —
 * в «Доступе…» папки у других тестов его нет.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const FOLDER = 'E2E Операции'

test('ТК-R2.54. Приглашение сразу с доступом к папке @tc-R2.54', async ({ page }) => {
  const id = stamp()
  const name = `Новый Сотрудник ${id}`
  const email = `new-${id}@selen.test`

  // 1. «Пользователи» → «Пригласить» → имя, email
  await openCompanyUsers(page)
  await page.getByRole('button', { name: 'Пригласить', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })
  await dialog.getByLabel('Имя и фамилия').fill(name)
  await dialog.getByLabel('Рабочий email').fill(email)

  // 2. «Добавить папку или пространство» → папка; роли — «Редактор» (по умолчанию) и ещё «Комментатор»
  await dialog.getByRole('button', { name: 'Добавить папку или пространство' }).click()
  const grants = dialog.getByRole('group', { name: 'Доступ к папкам и пространствам' })
  await grants.getByRole('combobox', { name: 'Папка или пространство' }).selectOption({ label: `Папка «${FOLDER}»` })
  const roles = grants.getByRole('group', { name: `Роли в «Папка «${FOLDER}»»` })
  await expect(roles.getByRole('button', { pressed: true })).toHaveText(['Редактор'])
  await roles.getByRole('button', { name: 'Комментатор', exact: true }).click()
  await expect(roles.getByRole('button', { pressed: true })).toHaveText(['Редактор', 'Комментатор'])
  await dialog.getByRole('button', { name: 'Отправить приглашение' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(`Приглашение отправлено на ${email}`)).toBeVisible()

  // 3. «Структура» → «Доступ…» у папки: приглашённый с чипами «Редактор» и «Комментатор»
  await openStructure(page)
  const access = await openNodeAccess(page, FOLDER)
  const row = grantRows(access, name)
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Приглашён')
  await expect(row).toContainText(email)
  await expect(row).not.toContainText('через папку')
  await expect(grantRoles(row)).toHaveText(['Редактор', 'Комментатор'])

  // Вернуть как было: у папки нет доступа приглашённого (приглашение остаётся — его не удаляют)
  await revokeNodeAccess(access, name)
  await expect(grantRows(access, name)).toHaveCount(0)
  await closeDialog(access)
})
