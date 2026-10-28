import { expect, test } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import { roleCell, searchUsers, userRow } from '../stage-3/helpers'
import {
  COMPANY_1,
  COMPANY_2,
  expandClients,
  GUEST_SPACE,
  openCompanyUsers,
  SECOND_SPACE,
  tree,
  treeCompany,
  usersTabs,
} from './helpers'

/**
 * ТК-R2.22: человеку с учётной записью не нужна регистрация; доступ к пространству выдаётся в том же окне. admin@ →
 * e2e-admin («Компания 1»); larisa@ (сотрудница «Компании 2») → «E2E Сотрудница второй» (e2e-invitee@: «дом» в «E2E
 * Компании 2», комментатор её RSECOND); «Маркетинг» → RGUEST «Гостевое» (доска «Задачи», RGUEST-1) — E2eSeeder::
 * guestsAndRightsCases. Письмо «Вам открыт доступ в Selen» — только вручную (в стеке E2E письма не отправляются,
 * MAIL_MAILER=log). Повторный прогон на том же стеке не годится: она уже сотрудница «Компании 1» (после make e2e данные
 * заново). Список «Пользователи» тест смотрит через поле «Поиск по имени или email» (П2c-2): в списке 25 человек
 * на странице, «E2E Сотрудница второй» — в конце алфавита.
 */

const PERSON = 'E2E Сотрудница второй'
const EMAIL = 'e2e-invitee@selen.test'

test('ТК-R2.22. Пригласить сотрудника другой компании — «Сотрудник добавлен», сразу с доступом @tc-R2.22', async ({
  browser,
}) => {
  // 1. «Пользователи» → «Пригласить»: имя, email, «Участник», «Гостевое» — «Редактор» → «Отправить приглашение»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  // Поиск по её имени: список отфильтрован (Владельца в нём нет) — её в компании ещё нет
  await searchUsers(admin, PERSON)
  await expect(userRow(admin, 'E2E Владелец')).toHaveCount(0)
  await expect(userRow(admin, PERSON)).toHaveCount(0)
  await admin.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Пригласить пользователя' })
  await dialog.getByLabel('Имя и фамилия').fill('Сотрудница')
  await dialog.getByLabel('Рабочий email').fill(EMAIL)
  await expect(dialog.getByLabel('Роль', { exact: true }).first()).toHaveValue('member')
  await dialog.getByRole('button', { name: 'Добавить пространство' }).click()
  const grants = dialog.getByRole('group', { name: 'Доступ к пространствам' })
  await grants.getByRole('combobox', { name: 'Пространство' }).selectOption({ label: `${GUEST_SPACE} (RGUEST)` })
  await grants.getByRole('combobox', { name: 'Роль' }).selectOption({ label: 'Редактор' })
  await dialog.getByRole('button', { name: 'Отправить приглашение' }).click()
  await expect(dialog).toBeHidden()

  // Уведомление «Сотрудник добавлен» с её именем в Selen; в списке — «Участник», «Активен», без бейджа «Гость»
  await expect(admin.getByText(`Сотрудник добавлен: ${PERSON}`)).toBeVisible()
  await expect(roleCell(admin, PERSON)).toHaveText('Участник')
  await expect(userRow(admin, PERSON).getByRole('cell').nth(3)).toHaveText('Активен')
  await expect(userRow(admin, PERSON).getByText('Гость')).toHaveCount(0)
  // Во вкладке «Приглашения» нового приглашения нет
  await usersTabs(admin).getByRole('link', { name: 'Приглашения' }).click()
  await expect(admin).toHaveURL(/\/invitations$/)
  await expect(admin.getByRole('columnheader', { name: 'Состояние' })).toBeVisible()
  await expect(admin.getByRole('row').filter({ hasText: EMAIL })).toHaveCount(0)

  // 2. Она: в дереве заголовки обеих компаний, в первой — «Гостевое»
  const person = await pageAs(browser, 'e2e-invitee@selen.test')
  await expect(tree(person).getByRole('heading')).toHaveText([COMPANY_1, COMPANY_2])
  await expect(treeCompany(person, COMPANY_1).getByRole('link', { name: new RegExp(`${GUEST_SPACE}$`) })).toBeVisible()
  const second = treeCompany(person, COMPANY_2)
  await expandClients(second)
  await expect(second.getByRole('link', { name: new RegExp(`${SECOND_SPACE}$`) })).toBeVisible()

  // В «Гостевом» она редактирует карточки: добавить карточку, поменять название — можно
  await openBoard(person, GUEST_SPACE, 'Задачи')
  await expect(person.getByRole('button', { name: 'Добавить карточку в To Do' }).first()).toBeVisible()
  await person.getByRole('button', { name: 'Открыть RGUEST-1: Задача для гостя' }).click()
  const window = person.getByRole('dialog', { name: 'Задача для гостя' })
  await expect(window.getByRole('textbox', { name: 'Название' })).toBeEditable()
  await expect(window.getByRole('checkbox', { name: 'Срочно' })).toBeEnabled()
})
