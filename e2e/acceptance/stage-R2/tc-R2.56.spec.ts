import { expect, test, type Page } from '@playwright/test'
import {
  closeDialog,
  FOLDERS_PERSON,
  grantNodeAccess,
  MOVE_NEEDS_ACCESS,
  openAdminPanel,
  openNodeAccess,
  openStructure,
  pagesClosedAfterEach,
  revokeNodeAccess,
  setStructureRight,
  structureAction,
} from './helpers'

/**
 * ТК-R2.56: перенос в другую папку может не добавить и не убрать людей, но поменять их роли (снять «только свои
 * карточки») — это тоже изменение доступа, для него нужно право «Управлять доступом» (решение PM 29.10, аудит П2d-1, S-1).
 * admin@ → e2e-admin; Демо Участник → «E2E Ярослав Папкин» (e2e-folders@: прав компании нет — тест на время отмечает ему
 * «Управлять структурой»); «Операции» → «E2E Роли: откуда», «Маркетинг» → FROLEMV «Роли: маркетинг» в ней, «Новые
 * направления» → «E2E Роли: куда» (E2eSeeder::foldersAccess). Перемещение не выполняется; в конце выдачи и право
 * снимаются — тест можно повторить.
 */

const FROM = 'E2E Роли: откуда'
const TO = 'E2E Роли: куда'
const SPACE = 'Роли: маркетинг'

/** Страницы сотрудников закрываются после теста. */
const openAs = pagesClosedAfterEach()

/** «⋯» у пространства → «Переместить в…» → «Куда» — папка «куда»: окно с тем, что изменится в доступе. */
async function moveDialog(page: Page) {
  await structureAction(page, SPACE, 'Переместить в…')
  const dialog = page.getByRole('dialog', { name: `Переместить «${SPACE}»` })
  await dialog.getByLabel('Куда').selectOption({ label: TO })
  await expect(dialog.getByText(`Изменятся роли: ${FOLDERS_PERSON}`)).toBeVisible()
  // Людей и групп, которые получат или потеряют доступ, нет — меняются только роли
  await expect(dialog.getByText('Получат доступ')).toHaveCount(0)
  await expect(dialog.getByText('Потеряют доступ')).toHaveCount(0)
  await expect(dialog.getByText('Доступ не изменится.')).toHaveCount(0)
  return dialog
}

test('ТК-R2.56. Перемещение, которое меняет только роли, — тоже только с правом «Управлять доступом» @tc-R2.56', async ({
  browser,
}) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  const admin = await openAs(browser, 'e2e-admin@selen.test')
  // 1. «Пользователи» → сотрудник → «Права компании» → «Управлять структурой (пространства и папки)»
  await setStructureRight(admin, true)
  try {
    // 2. «Структура» → «Доступ…» у папки «откуда» → сотрудник, «Комментатор — только свои карточки»; закрыть
    await openStructure(admin)
    const from = await openNodeAccess(admin, FROM)
    await grantNodeAccess(from, { user: FOLDERS_PERSON }, ['Комментатор — только свои карточки'])
    await closeDialog(from)
    // 3. «Доступ…» у папки «куда» → сотрудник, «Комментатор»; закрыть
    const to = await openNodeAccess(admin, TO)
    await grantNodeAccess(to, { user: FOLDERS_PERSON }, ['Комментатор'])
    await closeDialog(to)

    // 4. Сотрудник: «Администрирование» → «Структура» → «Переместить в…» → «куда»: «Изменятся роли», отказ, кнопка
    //    недоступна
    const person = await openAs(browser, 'e2e-folders@selen.test')
    const panel = await openAdminPanel(person)
    await panel.getByRole('link', { name: 'Структура', exact: true }).click()
    await expect(person.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
    const denied = await moveDialog(person)
    await expect(denied.getByRole('alert')).toHaveText(MOVE_NEEDS_ACCESS)
    await expect(denied.getByRole('button', { name: 'Переместить', exact: true })).toBeDisabled()
    await denied.getByRole('button', { name: 'Отмена' }).click()
    await expect(denied).toBeHidden()

    // 5. Администратор (есть «Управлять доступом») — то же: «Изменятся роли», красного нет, кнопка доступна
    const allowed = await moveDialog(admin)
    await expect(allowed.getByRole('alert')).toHaveCount(0)
    await expect(allowed.getByRole('button', { name: 'Переместить', exact: true })).toBeEnabled()
    // Не перемещаем
    await allowed.getByRole('button', { name: 'Отмена' }).click()
    await expect(allowed).toBeHidden()
  } finally {
    // Вернуть как было: выдач у сотрудника на папках нет, права «Управлять структурой» нет
    await openStructure(admin)
    for (const folder of [FROM, TO]) {
      const access = await openNodeAccess(admin, folder)
      if ((await access.getByRole('button', { name: `Снять доступ: ${FOLDERS_PERSON}` }).count()) > 0) {
        await revokeNodeAccess(access, FOLDERS_PERSON)
      }
      await expect(access.getByText('Доступ никому не выдан')).toBeVisible()
      await closeDialog(access)
    }
    await setStructureRight(admin, false)
  }
})
