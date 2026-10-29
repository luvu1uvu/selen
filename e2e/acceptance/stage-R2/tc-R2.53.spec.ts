import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import {
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  grantRoles,
  grantRows,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
  structureAction,
} from './helpers'

/**
 * ТК-R2.53: снять последнего, кто лично управляет доступом, или переместить так, что его не станет, нельзя. admin@ →
 * e2e-admin; «Операции» → «E2E Инвариант» с FINVA «Инвариант: эксплуатация» (лично администратор — «E2E Яков
 * Эксплуатации», вместо Егора) и FINVB «Инвариант: маркетинг» («E2E Яна Маркетинга», вместо Дины); Демо Участник →
 * «E2E Ярослав Папкин» (E2eSeeder::foldersAccess). В конце личные администраторы пространств возвращаются, а доступ
 * Ярослава к папке снимается — тест можно повторить.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const FOLDER = 'E2E Инвариант'
const OPS = 'Инвариант: эксплуатация'
const MKT = 'Инвариант: маркетинг'
const YAKOV = 'E2E Яков Эксплуатации'
const YANA = 'E2E Яна Маркетинга'

/** «Доступ…» пространства → «Снять доступ» у его личного администратора → подтвердить: снятие проходит. */
async function revokeSpaceAdmin(page: Page, space: string, person: string) {
  const dialog = await openNodeAccess(page, space)
  // Управляющий через папку остаётся
  const inherited = grantRows(dialog, FOLDERS_PERSON)
  await expect(inherited).toContainText(`через папку «${FOLDER}»`)
  await expect(grantRoles(inherited)).toHaveText(['Администратор'])
  await revokeNodeAccess(dialog, person)
  await expect(page.getByText('Доступ снят').first()).toBeVisible()
  await expect(grantRows(dialog, person)).toHaveCount(0)
  await closeDialog(dialog)
}

/** Вернуть личного администратора пространства. */
async function restoreSpaceAdmin(page: Page, space: string, person: string) {
  const dialog = await openNodeAccess(page, space)
  if ((await grantRows(dialog, person).count()) === 0) {
    await grantNodeAccess(dialog, { user: person }, ['Администратор'])
  }
  await expect(grantRoles(grantRows(dialog, person))).toHaveText(['Администратор'])
  await closeDialog(dialog)
}

test('ТК-R2.53. Пространство не остаётся без того, кто управляет доступом @tc-R2.53', async ({ page }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  // 1. «Структура» → «Доступ…» у папки → сотрудник, «Администратор»
  await openStructure(page)
  const folder = await openNodeAccess(page, FOLDER)
  await grantNodeAccess(folder, { user: FOLDERS_PERSON }, ['Администратор'])
  await closeDialog(folder)

  try {
    // 2. «Доступ…» у пространств → «Снять доступ» у их личных администраторов: оба снятия проходят
    await revokeSpaceAdmin(page, OPS, YAKOV)
    await revokeSpaceAdmin(page, MKT, YANA)

    // 3. «Доступ…» у папки → «Снять доступ» у управляющего через неё: отказ, он остался в окне
    const again = await openNodeAccess(page, FOLDER)
    await revokeNodeAccess(again, FOLDERS_PERSON)
    await expect(
      page.getByText(
        `Нельзя: в пространствах «${MKT}», «${OPS}» не останется никого, кто лично управляет доступом (роль ` +
          '«Администратор» лично на пространстве или на папке выше). Сначала назначьте другого.',
      ),
    ).toBeVisible()
    await expect(grantRoles(grantRows(again, FOLDERS_PERSON))).toHaveText(['Администратор'])
    await closeDialog(again)
    // …и после обновления страницы
    await page.reload()
    const reloaded = await openNodeAccess(page, FOLDER)
    await expect(grantRoles(grantRows(reloaded, FOLDERS_PERSON))).toHaveText(['Администратор'])
    await closeDialog(reloaded)

    // 4. «⋯» у пространства → «Переместить в…» → «Корень дерева»: красное предупреждение, «Переместить» недоступна
    await structureAction(page, MKT, 'Переместить в…')
    const move = page.getByRole('dialog', { name: `Переместить «${MKT}»` })
    await move.getByLabel('Куда').selectOption({ label: 'Корень дерева' })
    await expect(move.getByRole('alert')).toHaveText(
      `Перемещение невозможно: в пространстве «${MKT}» не останется никого, кто лично управляет доступом. Сначала ` +
        'назначьте администратора на самом пространстве или на новом месте.',
    )
    await expect(move.getByRole('button', { name: 'Переместить', exact: true })).toBeDisabled()
    await move.getByRole('button', { name: 'Отмена' }).click()
    await expect(move).toBeHidden()
  } finally {
    // Вернуть как было: личные администраторы пространств, без доступа Ярослава к папке
    await openStructure(page)
    await restoreSpaceAdmin(page, OPS, YAKOV)
    await restoreSpaceAdmin(page, MKT, YANA)
    const access = await openNodeAccess(page, FOLDER)
    await revokeNodeAccess(access, FOLDERS_PERSON)
    await expect(access.getByText('Доступ никому не выдан')).toBeVisible()
    await closeDialog(access)
  }
})
