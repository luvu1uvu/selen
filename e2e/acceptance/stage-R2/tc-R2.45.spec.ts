import { expect, test } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import { treeFolder } from '../stage-3/helpers'
import {
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  grantRoles,
  grantRows,
  openNodeAccess,
  openStructure,
  revokeNodeAccess,
  spaceLink,
  treeFolderItem,
} from './helpers'

/**
 * ТК-R2.45: роль, выданная на папку, действует во всех её пространствах. admin@ → e2e-admin; Демо Участник → «E2E
 * Ярослав Папкин» (e2e-folders@, доступа к папке нет); «Операции» → «E2E Операции» с FOPS «Папки: эксплуатация» (доска
 * «Заявки», FOPS-1) и FMKT «Папки: маркетинг» (доска «Контент», FMKT-1) — E2eSeeder::foldersAccess. В конце доступ
 * к папке снимается — тест можно повторить, ТК-R2.47 ждёт, что папки у Ярослава в дереве нет.
 */

const FOLDER = 'E2E Операции'
const OPS = 'Папки: эксплуатация'
const MKT = 'Папки: маркетинг'

test('ТК-R2.45. Доступ к папке открывает всё внутри @tc-R2.45', async ({ browser }) => {
  // 1–2. «Структура» → «⋯» у папки → «Доступ…» → «Сотруднику», роль «Комментатор» вместо «Редактора»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openStructure(admin)
  const dialog = await openNodeAccess(admin, FOLDER)
  await expect(dialog.getByRole('group', { name: 'Роли', exact: true }).getByRole('button', { pressed: true })).toHaveText([
    'Редактор',
  ])
  await grantNodeAccess(dialog, { user: FOLDERS_PERSON }, ['Комментатор'])
  try {
    // В окне — строка с чипом «Комментатор», без пометки «через папку»
    const row = grantRows(dialog, FOLDERS_PERSON)
    await expect(row).toHaveCount(1)
    await expect(grantRoles(row)).toHaveText(['Комментатор'])
    await expect(row).not.toContainText('через папку')

    // 3. Сотрудник: в дереве — папка с обоими пространствами
    const person = await pageAs(browser, 'e2e-folders@selen.test')
    const folder = treeFolder(person, FOLDER)
    await expect(folder).toBeVisible()
    if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click()
    const item = treeFolderItem(person, FOLDER)
    await expect(item.getByRole('link', { name: new RegExp(`${OPS}$`) })).toBeVisible()
    await expect(item.getByRole('link', { name: new RegExp(`${MKT}$`) })).toBeVisible()

    // Обе открываются; на досках нет «+ Карточка», комментировать можно, название не меняется
    for (const [space, board, card] of [
      [OPS, 'Заявки', 'FOPS-1: Заявка для комментария'],
      [MKT, 'Контент', 'FMKT-1: Пост в канал'],
    ]) {
      await spaceLink(person, space).click()
      await expect(person.getByRole('heading', { name: space }).first()).toBeVisible()
      await openBoard(person, space, board)
      await expect(person.getByRole('button', { name: `Открыть ${card}` })).toBeVisible()
      await expect(person.getByRole('button', { name: /^Добавить карточку/ })).toHaveCount(0)
      await person.getByRole('button', { name: `Открыть ${card}` }).click()
      const window = person.getByRole('dialog', { name: card.split(': ')[1] })
      await expect(window.getByRole('textbox', { name: 'Новый комментарий' })).toBeVisible()
      await expect(window.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
      await window.getByRole('button', { name: 'Закрыть', exact: true }).click()
      await expect(window).toBeHidden()
    }

    // Комментарий в карточке пространства из папки появляется
    await person.getByRole('button', { name: 'Открыть FMKT-1: Пост в канал' }).click()
    const window = person.getByRole('dialog', { name: 'Пост в канал' })
    const text = `Проверка ТК-R2.45 ${Date.now()}`
    await window.getByRole('textbox', { name: 'Новый комментарий' }).click()
    await person.keyboard.type(text)
    await window.getByRole('button', { name: 'Отправить' }).click()
    await expect(window.getByRole('listitem').filter({ hasText: text }).first()).toBeVisible()
  } finally {
    // Вернуть как было: доступ к папке снят
    await revokeNodeAccess(dialog, FOLDERS_PERSON)
    await expect(grantRows(dialog, FOLDERS_PERSON)).toHaveCount(0)
    await closeDialog(dialog)
  }
})
