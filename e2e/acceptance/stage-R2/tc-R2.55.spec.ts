import { expect, test } from '@playwright/test'
import { structureRow } from '../stage-3/helpers'
import {
  closeDialog,
  grantNodeAccess,
  MOVE_NEEDS_ACCESS,
  openAdminPanel,
  openNodeAccess,
  openStructure,
  pagesClosedAfterEach,
  revokeNodeAccess,
  setStructureRight,
} from './helpers'

/**
 * ТК-R2.55: перенос в другую папку меняет, у кого есть доступ, — для него мало права «Управлять структурой», нужно ещё
 * «Управлять доступом» (решение PM 29.10). admin@ → e2e-admin; Демо Участник → «E2E Ярослав Папкин» (e2e-folders@: прав
 * компании нет — тест на время отмечает ему «Управлять структурой»); «Маркетинг» → FSTRUCT «Структура: маркетинг» в «E2E
 * Структура: откуда» (на ней выдач нет), «Продуктовые команды» → «E2E Структура: куда» (тест выдаёт на неё доступ группе
 * «E2E Подрядчики»), «Новые направления» → «E2E Новые направления» (выдач нет) — E2eSeeder::foldersAccess. Перемещение
 * не выполняется; в конце право и доступ группы снимаются — тест можно повторить.
 */

const SPACE = 'Структура: маркетинг'
const FROM = 'E2E Структура: откуда'
const TO = 'E2E Структура: куда'
const NO_GRANTS = 'E2E Новые направления'
const GROUP = 'E2E Подрядчики'

/** Страницы сотрудников закрываются после теста. */
const openAs = pagesClosedAfterEach()

test('ТК-R2.55. Перемещение, которое меняет доступ, — только с правом «Управлять доступом» @tc-R2.55', async ({
  browser,
}) => {
  // Много шагов, выдача и уборка в конце: под нагрузкой полного прогона тест шёл дольше 30 с (ТК-R2.48)
  test.slow()
  const admin = await openAs(browser, 'e2e-admin@selen.test')
  // 1. «Пользователи» → сотрудник → «Права компании» → «Управлять структурой (пространства и папки)»
  await setStructureRight(admin, true)
  try {
    // 2. «Структура» → «⋯» у папки «куда» → «Доступ…» → «Группе» → группа, «Комментатор»; закрыть окно
    await openStructure(admin)
    const access = await openNodeAccess(admin, TO)
    await grantNodeAccess(access, { group: GROUP }, ['Комментатор'])
    await closeDialog(access)

    // 3. Сотрудник: «Администрирование» → «Структура» → «⋯» у пространства → «Переместить в…» → «Куда» — папка «куда»
    const person = await openAs(browser, 'e2e-folders@selen.test')
    const panel = await openAdminPanel(person)
    await panel.getByRole('link', { name: 'Структура', exact: true }).click()
    await expect(person.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
    // «Доступ…» у него нет — только «Управлять структурой»
    await person.getByRole('button', { name: `Действия с «${SPACE}»` }).click()
    await expect(person.getByRole('menuitem', { name: 'Доступ…' })).toHaveCount(0)
    await person.getByRole('menuitem', { name: 'Переместить в…', exact: true }).click()
    const dialog = person.getByRole('dialog', { name: `Переместить «${SPACE}»` })
    await dialog.getByLabel('Куда').selectOption({ label: TO })
    await expect(dialog.getByText(`Получат доступ: группа «${GROUP}»`)).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveText(MOVE_NEEDS_ACCESS)
    await expect(dialog.getByRole('button', { name: 'Переместить', exact: true })).toBeDisabled()

    // 4. Там же «Куда» — папка без выдач: «Доступ не изменится.», красного сообщения нет, «Переместить» доступна
    await dialog.getByLabel('Куда').selectOption({ label: NO_GRANTS })
    await expect(dialog.getByText('Доступ не изменится.')).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await expect(dialog.getByText('Получат доступ')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Переместить', exact: true })).toBeEnabled()

    // Не перемещаем: «Отмена» — пространство осталось в папке «откуда» (сразу под ней, на уровень глубже)
    await dialog.getByRole('button', { name: 'Отмена' }).click()
    await expect(dialog).toBeHidden()
    await expect(structureRow(person, SPACE).locator('xpath=preceding-sibling::li[1]')).toContainText(FROM)
    await expect(structureRow(person, SPACE)).toHaveCSS('padding-left', '36px')
  } finally {
    // Вернуть как было: у группы нет доступа к папке «куда», у сотрудника нет права «Управлять структурой»
    await openStructure(admin)
    const folder = await openNodeAccess(admin, TO)
    if ((await folder.getByRole('button', { name: `Снять доступ: ${GROUP}` }).count()) > 0) {
      await revokeNodeAccess(folder, GROUP)
    }
    await expect(folder.getByText('Доступ никому не выдан')).toBeVisible()
    await closeDialog(folder)
    await setStructureRight(admin, false)
  }
})
