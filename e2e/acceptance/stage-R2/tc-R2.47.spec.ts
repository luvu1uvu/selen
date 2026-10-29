import { expect, test, type Locator } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { treeFolder } from '../stage-3/helpers'
import {
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
  tree,
  treeFolderItem,
} from './helpers'

/**
 * ТК-R2.47: дерево строится из прав — видна папка, на которую есть доступ, даже пустая; папок без доступа нет. admin@ →
 * e2e-admin; Демо Участник → «E2E Ярослав Папкин» (e2e-folders@: лично Редактор FDEV «Папки: разработка» в «E2E
 * Продуктовые команды»); «Новые направления» → «Идеи на 2027» — пустые «E2E Новые направления» → «E2E Идеи на 2027»;
 * «Операции» — «E2E Операции» (к ней у него доступа нет: ТК-R2.45 его снимает) и «E2E Мобильные» (папка tree.spec)
 * — E2eSeeder::foldersAccess. В конце доступ к папке снимается — тест можно повторить. Что папка «бледная» — только
 * вручную (внешний вид); подпись «пустая» проверяется здесь.
 */

const PARENT = 'E2E Новые направления'
const FOLDER = 'E2E Идеи на 2027'

/** Подпись «пустая» — рядом с кнопкой папки, в той же строке дерева (как в ТК-3.29). */
const emptyMark = (folder: Locator) => folder.locator('xpath=..').locator('span[tabindex="0"]', { hasText: 'пустая' })

test('ТК-R2.47. Пустая папка с доступом видна, остальные — нет @tc-R2.47', async ({ browser }) => {
  // 1. «Структура» → «⋯» у вложенной пустой папки → «Доступ…» → сотрудник, «Комментатор»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openStructure(admin)
  const dialog = await openNodeAccess(admin, FOLDER)
  await grantNodeAccess(dialog, { user: FOLDERS_PERSON }, ['Комментатор'])

  try {
    // 2. Сотрудник: «Продуктовые команды» с «Разработкой», «Новые направления» → «Идеи на 2027» (обе — «пустая»)
    const person = await pageAs(browser, 'e2e-folders@selen.test')
    const product = treeFolder(person, 'E2E Продуктовые команды')
    await expect(product).toBeVisible()
    if ((await product.getAttribute('aria-expanded')) !== 'true') await product.click()
    await expect(
      treeFolderItem(person, 'E2E Продуктовые команды').getByRole('link', { name: /Папки: разработка$/ }),
    ).toBeVisible()

    const parent = treeFolder(person, PARENT)
    await expect(parent).toBeVisible()
    await expect(emptyMark(parent)).toHaveText('пустая')
    if ((await parent.getAttribute('aria-expanded')) !== 'true') await parent.click()
    const folder = treeFolderItem(person, PARENT).getByRole('button', { name: FOLDER, exact: true })
    await expect(folder).toBeVisible()
    await expect(emptyMark(folder)).toHaveText('пустая')

    // Папок без доступа нет
    for (const other of ['E2E Операции', 'E2E Мобильные', 'E2E Инвариант']) {
      await expect(tree(person).getByText(other, { exact: true }), other).toHaveCount(0)
    }
  } finally {
    // Вернуть как было
    await revokeNodeAccess(dialog, FOLDERS_PERSON)
    await expect(dialog.getByText('Доступ никому не выдан')).toBeVisible()
    await closeDialog(dialog)
  }
})
