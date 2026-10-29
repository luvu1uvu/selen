import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { structureRow } from '../stage-3/helpers'
import {
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
  structureAction,
} from './helpers'

/**
 * ТК-R2.52: перемещение меняет доступ, выданный на папки, — это видно до подтверждения. admin@ → e2e-admin; «Операции»
 * с «Комментатором» Демо Участника (предусловие — ТК-R2.45) → «E2E Перенос: откуда» с «Комментатором» «E2E Ярослав
 * Папкин»; «Маркетинг» → FMOVE «Перенос: маркетинг» в ней; «Продуктовые команды» → пустая «E2E Перенос: куда»
 * (E2eSeeder::foldersAccess); «Подрядчики» → «E2E Подрядчики». Перемещение отменяется; в конце доступ группы к папке
 * снимается — тест можно повторить.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const FROM = 'E2E Перенос: откуда'
const TO = 'E2E Перенос: куда'
const SPACE = 'Перенос: маркетинг'
const GROUP = 'E2E Подрядчики'

test('ТК-R2.52. «Переместить в…»: кто получит и кто потеряет доступ @tc-R2.52', async ({ page }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  // 1. «Структура» → «⋯» у папки «куда» → «Доступ…» → «Группе» → группа, «Комментатор»; закрыть окно
  await openStructure(page)
  const access = await openNodeAccess(page, TO)
  await grantNodeAccess(access, { group: GROUP }, ['Комментатор'])
  await closeDialog(access)

  try {
    // Пространство — внутри папки «откуда» (сразу под ней, на уровень глубже)
    const row = structureRow(page, SPACE)
    await expect(row.locator('xpath=preceding-sibling::li[1]')).toContainText(FROM)
    await expect(row).toHaveCSS('padding-left', '36px')

    // 2. «⋯» у пространства → «Переместить в…» → «Куда» — папка «куда»
    await structureAction(page, SPACE, 'Переместить в…')
    const dialog = page.getByRole('dialog', { name: `Переместить «${SPACE}»` })
    await dialog.getByLabel('Куда').selectOption({ label: TO })
    await expect(dialog.getByText(`Получат доступ: группа «${GROUP}»`)).toBeVisible()
    await expect(dialog.getByText(`Потеряют доступ: ${FOLDERS_PERSON}`)).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Переместить', exact: true })).toBeEnabled()

    // 3. «Отмена»: пространство осталось в папке «откуда»
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    await expect(dialog).toBeHidden()
    await expect(row.locator('xpath=preceding-sibling::li[1]')).toContainText(FROM)
    await page.reload()
    await expect(structureRow(page, SPACE).locator('xpath=preceding-sibling::li[1]')).toContainText(FROM)
  } finally {
    // Вернуть как было: у группы нет доступа к папке «куда»
    await openStructure(page)
    const folder = await openNodeAccess(page, TO)
    await revokeNodeAccess(folder, GROUP)
    await expect(folder.getByText('Доступ никому не выдан')).toBeVisible()
    await closeDialog(folder)
  }
})
