import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import {
  chips,
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  openMembersByKey,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
} from './helpers'

/**
 * ТК-R2.48: в «Участниках» пространства видно, откуда у человека доступ, в том числе с папки выше; личные роли — чипами.
 * admin@ → e2e-admin (администратор FDEV); Демо Участник → «E2E Ярослав Папкин» (e2e-folders@, лично Редактор FDEV);
 * «Продуктовые команды» → «E2E Продуктовые команды», «Разработка» → FDEV «Папки: разработка» (E2eSeeder::
 * foldersAccess). В конце доступ к папке снимается — тест можно повторить.
 */

const FOLDER = 'E2E Продуктовые команды'
const SPACE = 'Папки: разработка'

test('ТК-R2.48. «Участники»: источник «через папку», личные роли — чипами @tc-R2.48', async ({ browser }) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  // 1. «Структура» → «⋯» у папки → «Доступ…» → сотрудник, «Комментатор»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openStructure(admin)
  const dialog = await openNodeAccess(admin, FOLDER)
  await grantNodeAccess(dialog, { user: FOLDERS_PERSON }, ['Комментатор'])
  await closeDialog(dialog)

  try {
    // 2. Пространство (FDEV) → «Участники» → «Люди», строка сотрудника
    await openMembersByKey(admin, 'FDEV', SPACE)
    await expect(admin.getByRole('tab', { name: 'Люди', exact: true })).toHaveAttribute('aria-selected', 'true')
    const sources = admin.getByRole('list', { name: `Источники доступа ${FOLDERS_PERSON}` })
    await expect(sources.getByRole('listitem')).toHaveText([
      'Лично: Редактор',
      `Лично: Комментатор · через папку «${FOLDER}»`,
    ])
    // В «Личных ролях» — один чип «Редактор»: роль с папки здесь не показывается и не меняется
    const row = admin.getByRole('row').filter({ has: sources })
    await expect(admin.getByRole('columnheader', { name: 'Личные роли' })).toBeVisible()
    await expect(chips(row.getByRole('cell').nth(1))).toHaveText(['Редактор'])
    await expect(row.getByRole('button', { name: `Изменить роли ${FOLDERS_PERSON}` })).toBeVisible()
  } finally {
    // Вернуть как было
    await openStructure(admin)
    const access = await openNodeAccess(admin, FOLDER)
    await revokeNodeAccess(access, FOLDERS_PERSON)
    await expect(access.getByRole('row').filter({ hasText: FOLDERS_PERSON })).toHaveCount(0)
    await closeDialog(access)
  }
})
