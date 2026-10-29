import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { treeFolder } from '../stage-3/helpers'
import { openStructure, structureAction, tree, treeFolderItem } from './helpers'

/**
 * ТК-R2.46: доступ к папке действует и на то, что создадут в ней позже. admin@ → e2e-admin; Демо Участник с ролью
 * «Комментатор» на «Операции» (предусловие — ТК-R2.45) → «E2E Ярослав Папкин» (e2e-folders@) с ролью «Комментатор»
 * на папке «E2E Склады» (E2eSeeder::foldersAccess). Папка видна e2e-admin в дереве (он администратор «Склады: основной»
 * в ней) — у неё есть «+». Название и ключ нового пространства — одноразовые; в конце оно удаляется навсегда (карточек
 * в нём нет) — тест можно повторить.
 *
 * В демо-данных admin@ не видит «Операции» в своём дереве (у него нет доступа ни к чему внутри) — шаг 1 там выполним
 * только обходом: «Добавить в дерево» → «Пространство», затем «Структура» → «Переместить в…» (отчёт тестировщика П2d-1).
 */

const FOLDER = 'E2E Склады'

/** Ключ пространства — только латинские буквы, 2–10 (CHECK в БД): «ST» и метка времени буквами. */
const uniqueKey = () =>
  `ST${Date.now()
    .toString(36)
    .toUpperCase()
    .replace(/[0-9]/g, (digit) => 'ABCDEFGHIJ'[Number(digit)])
    .slice(-8)}`

test('ТК-R2.46. Новое пространство в папке сразу доступно @tc-R2.46', async ({ browser }) => {
  const name = `Склад ${Date.now().toString(36)}`
  const key = uniqueKey()

  // До: у сотрудника папка в дереве, нового пространства в ней нет
  const person = await pageAs(browser, 'e2e-folders@selen.test')
  await expect(treeFolder(person, FOLDER)).toBeVisible()
  await expect(tree(person).getByText(name, { exact: true })).toHaveCount(0)

  // 1. Администратор: в дереве «+» у папки → «Пространство» → название, ключ → «Создать»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await tree(admin).getByRole('button', { name: `Добавить в «${FOLDER}»` }).click()
  await admin.getByRole('menuitem', { name: 'Пространство', exact: true }).click()
  const dialog = admin.getByRole('dialog', { name: 'Новое пространство' })
  await expect(dialog).toContainText(`Оно появится в папке «${FOLDER}».`)
  await dialog.getByLabel('Название', { exact: true }).fill(name)
  await dialog.getByLabel('Ключ', { exact: true }).fill(key)
  await dialog.getByRole('button', { name: 'Создать', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(admin.getByText('Пространство создано')).toBeVisible()

  try {
    // 2. Сотрудник обновляет страницу: в папке — новое пространство, оно открывается
    await person.reload()
    const folder = treeFolder(person, FOLDER)
    await expect(folder).toBeVisible()
    if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click()
    const link = treeFolderItem(person, FOLDER).getByRole('link', { name: new RegExp(`${name}$`) })
    await expect(link).toBeVisible()
    await link.click()
    await expect(person).toHaveURL(new RegExp(`/spaces/${key}$`))
    await expect(person.getByRole('heading', { name }).first()).toBeVisible()
    await expect(person.getByText('Нет доступа к пространству или оно не существует')).toHaveCount(0)
  } finally {
    // Вернуть как было: пространство без карточек удаляется навсегда
    await openStructure(admin)
    await structureAction(admin, name, 'Удалить навсегда…')
    await admin
      .getByRole('dialog', { name: 'Удалить пространство навсегда?' })
      .getByRole('button', { name: 'Удалить навсегда' })
      .click()
    await expect(admin.getByText('Пространство удалено')).toBeVisible()
  }
})
