import { expect, test } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import { roleCell, userRow } from '../stage-3/helpers'
import {
  adminRail,
  chooseRoles,
  column,
  COMPANY_1,
  COMPANY_2,
  drag,
  expandClients,
  GUEST_SPACE,
  openCompanyUsers,
  SECOND_SPACE,
  spaceLink,
  tree,
  treeCompany,
  userActions,
} from './helpers'

/**
 * ТК-R2.16: сотрудник другой компании получает доступ только к выбранному пространству и больше ни к чему. admin@ →
 * e2e-admin (администратор «Компании 1»); kirill@ (сотрудник «Компании 2») → «E2E Кандидат в гости» (e2e-guest-
 * candidate@: «дом» в «E2E Компании 2», комментатор её RSECOND «Вторая компания: продажи»); «Разработка» → RGUEST
 * «Гостевое», доска «Задачи», карточка RGUEST-1 «Задача для гостя» (E2eSeeder::guestsAndRights, guestsAndRightsCases).
 * В конце гостя убираем — тест можно повторить.
 *
 * П2d-1: роль в строке пространства окна «Добавить гостя» — чипами (группа «Роли в «…»», без «Администратора») вместо
 * списка «Роль».
 */

const CANDIDATE = 'E2E Кандидат в гости'
const EMAIL = 'e2e-guest-candidate@selen.test'

test('ТК-R2.16. Добавить гостя — он видит только выбранное пространство @tc-R2.16', async ({ browser }) => {
  // 1–2. Администратор: «Пользователи» → «Добавить гостя»: email, пространство «Гостевое», «Комментатор», без срока
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  await admin.getByRole('button', { name: 'Добавить гостя' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Добавить гостя' })
  await dialog.getByLabel('Email сотрудника').fill(EMAIL)
  await dialog.getByRole('button', { name: 'Добавить пространство' }).click()
  const grants = dialog.getByRole('group', { name: 'Доступ к пространствам' })
  await grants.getByRole('combobox', { name: 'Пространство' }).selectOption({ label: `${GUEST_SPACE} (RGUEST)` })
  const roles = grants.getByRole('group', { name: `Роли в «${GUEST_SPACE} (RGUEST)»` })
  await expect(roles.getByRole('button', { name: 'Администратор', exact: true })).toHaveCount(0)
  await chooseRoles(roles, ['Комментатор'])
  await expect(dialog.getByLabel('Доступ до')).toHaveValue('')
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(admin.getByText(`Гость добавлен: ${EMAIL}`)).toBeVisible()

  // В списке — с бейджем «Гость» в колонке «Роль», статус «Активен»
  await expect(roleCell(admin, CANDIDATE)).toHaveText('Гость')
  await expect(userRow(admin, CANDIDATE).getByRole('cell').nth(3)).toHaveText('Активен')

  // 3. Гость: в дереве заголовки обеих компаний; в первой — только «Гостевое», во второй — его пространства
  const guest = await pageAs(browser, 'e2e-guest-candidate@selen.test')
  await expect(tree(guest).getByRole('heading')).toHaveText([COMPANY_1, COMPANY_2])
  const first = treeCompany(guest, COMPANY_1)
  await expect(first.getByRole('link')).toHaveCount(1)
  await expect(spaceLink(guest, GUEST_SPACE)).toBeVisible()
  for (const other of ['Сквозные тесты', 'Права: компания', 'Дом: первая компания']) {
    await expect(tree(guest).getByText(other, { exact: true }), other).toHaveCount(0)
  }
  const second = treeCompany(guest, COMPANY_2)
  await expandClients(second)
  await expect(second.getByRole('link', { name: new RegExp(`${SECOND_SPACE}$`) })).toBeVisible()
  // «Администрирования» у гостя нет вовсе — значит, нет и «Компании 1»
  await expect(adminRail(guest)).toHaveCount(0)

  // «Гостевое» → «Задачи»: карточка не перетаскивается
  await openBoard(guest, GUEST_SPACE, 'Задачи')
  const card = guest.getByRole('button', { name: 'Открыть RGUEST-1: Задача для гостя' })
  await expect(column(guest, 'To Do').locator(card)).toBeVisible()
  const moves: string[] = []
  guest.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/move')) moves.push(request.url())
  })
  await drag(guest, card, column(guest, 'In Progress'))
  await expect(column(guest, 'To Do').locator(card)).toBeVisible()
  await expect(column(guest, 'In Progress').getByRole('button', { name: /^Открыть RGUEST-1: / })).toHaveCount(0)
  expect(moves).toEqual([])

  // Комментарий появился
  await card.click()
  const window = guest.getByRole('dialog', { name: 'Задача для гостя' })
  const text = 'Проверка ТК-R2.16'
  await window.getByRole('textbox', { name: 'Новый комментарий' }).click()
  await guest.keyboard.type(text)
  await window.getByRole('button', { name: 'Отправить' }).click()
  await expect(window.getByRole('listitem').filter({ hasText: text }).first()).toBeVisible()

  // Вернуть как было: «⋯» → «Убрать гостя» → подтвердить
  await userActions(admin, CANDIDATE).click()
  await admin.getByRole('menuitem', { name: 'Убрать гостя' }).click()
  const confirm = admin.getByRole('dialog', { name: 'Убрать гостя?' })
  await confirm.getByRole('button', { name: 'Убрать гостя' }).click()
  await expect(confirm).toBeHidden()
  await expect(userRow(admin, CANDIDATE)).toHaveCount(0)
})
