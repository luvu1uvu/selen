import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import {
  closeDialog,
  grantNodeAccess,
  grantRoles,
  grantRows,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
} from './helpers'

/**
 * ТК-R2.50: в «Доступе…» пространства видно, что доступ пришёл с папки, и поменять его там нельзя. admin@ → e2e-admin;
 * «Операции» → «E2E Операции», «Эксплуатация» → FOPS «Папки: эксплуатация», Егор Соколов (лично администратор) → «E2E Яков
 * Эксплуатации» (E2eSeeder::foldersAccess); группа «Руководители» → «E2E Руководители» (E2eSeeder::rights2). В конце
 * доступ группы к папке снимается — тест можно повторить.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const FOLDER = 'E2E Операции'
const SPACE = 'Папки: эксплуатация'
const GROUP = 'E2E Руководители'
const ADMIN = 'E2E Яков Эксплуатации'

test('ТК-R2.50. «Доступ…» пространства: унаследованное — «через папку», меняется на папке @tc-R2.50', async ({ page }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  // 1. «Структура» → «⋯» у папки → «Доступ…» → «Группе» → группа, «Комментатор»
  await openStructure(page)
  const folder = await openNodeAccess(page, FOLDER)
  await grantNodeAccess(folder, { group: GROUP }, ['Комментатор'])
  await closeDialog(folder)

  try {
    // 2. «⋯» у пространства → «Доступ…»: группа — «через папку», с чипом «Комментатор», без действий
    const dialog = await openNodeAccess(page, SPACE)
    const group = grantRows(dialog, GROUP)
    await expect(group).toHaveCount(1)
    await expect(group).toContainText(`через папку «${FOLDER}»`)
    await expect(grantRoles(group)).toHaveText(['Комментатор'])
    await expect(group.getByRole('button')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: `Изменить роли: ${GROUP}` })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: `Снять доступ: ${GROUP}` })).toHaveCount(0)

    // У личного администратора пространства кнопки есть
    const admin = grantRows(dialog, ADMIN)
    await expect(admin).not.toContainText('через папку')
    await expect(grantRoles(admin)).toHaveText(['Администратор'])
    await expect(admin.getByRole('button', { name: `Изменить роли: ${ADMIN}` })).toBeVisible()
    await expect(admin.getByRole('button', { name: `Снять доступ: ${ADMIN}` })).toBeVisible()
    await closeDialog(dialog)
  } finally {
    // Вернуть как было
    const access = await openNodeAccess(page, FOLDER)
    await revokeNodeAccess(access, GROUP)
    await expect(grantRows(access, GROUP)).toHaveCount(0)
    await closeDialog(access)
  }
})
