import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { roleCell, userRow } from '../stage-3/helpers'
import {
  chooseRoles,
  COMPANY_3,
  moscowDate,
  moscowIsoDate,
  openCompanyUsers,
  spaceLink,
  THIRD_SPACE,
  tree,
  treeCompany,
  userActions,
} from './helpers'

/**
 * ТК-R2.17: срок гостя виден в списке, доступ гостя меняется и снимается целиком. irina@ → e2e-multi-admin
 * (администратор «E2E Компании 2» и «E2E Компании 3»); vera@ (гость «Компании 3» на 30 дней) → «E2E Гость» (e2e-guest@:
 * «дом» в «E2E Компании 2», гость «E2E Компании 3» в RTHIRD «Третья компания: склад» на 30 дней — E2eSeeder::
 * guestsAndRightsCases); «Склад» → RTHIRD. Срок — до конца дня по часовому поясу пользователя (Москва), бейдж —
 * в нём же. В конце гостя возвращает Владелец (лимит приглашений и гостей e2e-multi-admin занят ТК-R2.14) — тест можно
 * повторить.
 *
 * П2d-1: роль в строке пространства окна «Добавить гостя» — чипами (группа «Роли в «…»») вместо списка «Роль».
 */

const GUEST = 'E2E Гость'
const EMAIL = 'e2e-guest@selen.test'

test('ТК-R2.17. Гость: бейдж со сроком, изменить доступ, убрать @tc-R2.17', async ({ browser }) => {
  // До проверки: у гостя в дереве есть третья компания и «Склад»
  const guest = await pageAs(browser, 'e2e-guest@selen.test')
  await expect(treeCompany(guest, COMPANY_3).getByRole('link', { name: new RegExp(`${THIRD_SPACE}$`) })).toBeVisible()

  // 1. Администратор: выбор «E2E Компания 3» → «Пользователи»: бейдж «Гость до <через 30 дней>»
  const admin = await pageAs(browser, 'e2e-multi-admin@selen.test')
  await openCompanyUsers(admin, COMPANY_3)
  await expect(roleCell(admin, GUEST)).toHaveText(`Гость до ${moscowDate(30)}`)
  // Фильтр статуса «Гости» — только он
  await admin.getByRole('combobox', { name: 'Статус' }).selectOption({ label: 'Гости' })
  await expect(admin.getByRole('main').getByRole('row')).toHaveCount(2)
  await expect(userRow(admin, GUEST)).toBeVisible()
  await admin.getByRole('combobox', { name: 'Статус' }).selectOption({ label: 'Все' })

  // 2. «⋯» → «Изменить доступ гостя…»: срок — завтра → «Сохранить»
  await userActions(admin, GUEST).click()
  await admin.getByRole('menuitem', { name: 'Изменить доступ гостя…' }).click()
  const dialog = admin.getByRole('dialog', { name: `Доступ гостя «${GUEST}»` })
  await expect(dialog.getByLabel('Доступ до')).toHaveValue(moscowIsoDate(30))
  await dialog.getByLabel('Доступ до').fill(moscowIsoDate(1))
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()
  await expect(admin.getByText('Доступ гостя изменён')).toBeVisible()
  await expect(roleCell(admin, GUEST)).toHaveText(`Гость до ${moscowDate(1)}`)

  // 3. «⋯» → «Убрать гостя» → подтвердить: его нет в списке
  await userActions(admin, GUEST).click()
  await admin.getByRole('menuitem', { name: 'Убрать гостя' }).click()
  const confirm = admin.getByRole('dialog', { name: 'Убрать гостя?' })
  await confirm.getByRole('button', { name: 'Убрать гостя' }).click()
  await expect(confirm).toBeHidden()
  await expect(admin.getByText('Гость убран')).toBeVisible()
  await expect(userRow(admin, GUEST)).toHaveCount(0)

  // 4. Гость: в дереве нет третьей компании и «Склада»
  await guest.reload()
  await expect(tree(guest).getByRole('link').first()).toBeVisible()
  await expect(treeCompany(guest, COMPANY_3)).toHaveCount(0)
  await expect(tree(guest).getByText(THIRD_SPACE)).toHaveCount(0)
  await expect(tree(guest).getByText(COMPANY_3)).toHaveCount(0)

  // Вернуть как было: Владелец добавляет гостя снова — «Склад», «Редактор», 30 дней
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_3)
  await owner.getByRole('button', { name: 'Добавить гостя' }).click()
  const add = owner.getByRole('dialog', { name: 'Добавить гостя' })
  await add.getByLabel('Email сотрудника').fill(EMAIL)
  await add.getByRole('button', { name: 'Добавить пространство' }).click()
  const grants = add.getByRole('group', { name: 'Доступ к пространствам' })
  await grants.getByRole('combobox', { name: 'Пространство' }).selectOption({ label: `${THIRD_SPACE} (RTHIRD)` })
  await chooseRoles(grants.getByRole('group', { name: `Роли в «${THIRD_SPACE} (RTHIRD)»` }), ['Редактор'])
  await add.getByLabel('Доступ до').fill(moscowIsoDate(30))
  await add.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(add).toBeHidden()
  await expect(roleCell(owner, GUEST)).toHaveText(`Гость до ${moscowDate(30)}`)
  await guest.reload()
  await expect(spaceLink(guest, THIRD_SPACE)).toBeVisible()
})
