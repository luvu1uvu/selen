import { expect, test } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import {
  chips,
  COMPANY_1,
  COMPANY_2,
  expandClients,
  GUEST_SPACE,
  openMembers,
  SECOND_SPACE,
  spaceLink,
  tree,
  treeCompany,
} from './helpers'

/**
 * ТК-R2.18: гость работает только там, куда его добавили, и в «Участниках» помечен. boris@ (гость «Компании 2»
 * в «Поддержке», «Комментатор») → «E2E Гость» (e2e-guest@: «дом» в «E2E Компании 2» с её RSECOND «Вторая компания:
 * продажи», гость «Компании 1» в RGUEST «Гостевое», «Комментатор»); «Поддержка» → RGUEST, доска «Задачи», карточка
 * RGUEST-1; irina@ (администратор «Поддержки») → e2e-admin (администратор RGUEST). Компании наоборот: гость — в «Компании
 * 1», его «дом» — вторая (E2eSeeder::guestsAndRights, guestsAndRightsCases). Данные не меняются.
 *
 * П2d-1: роли в «Участниках» — чипы в столбце «Личные роли» и окно «Роли: …» по кнопке «Изменить роли …» (вместо списка
 * «Роль …» в строке): у гостя в окне нет «Администратора», у сотрудника компании — есть; окна закрываются «Отменой».
 */

const GUEST = 'E2E Гость'

test('ТК-R2.18. Гость в чужом пространстве — с бейджем, только своё @tc-R2.18', async ({ browser }) => {
  // 1. Гость: в компании, где он гость, — только «Гостевое»; в своей — его пространства
  const guest = await pageAs(browser, 'e2e-guest@selen.test')
  const guestCompany = treeCompany(guest, COMPANY_1)
  await expect(guestCompany.getByRole('heading', { name: COMPANY_1 })).toBeVisible()
  await expect(guestCompany.getByRole('link')).toHaveCount(1)
  await expect(spaceLink(guest, GUEST_SPACE)).toBeVisible()
  for (const other of ['Сквозные тесты', 'Права: компания', 'Дом: первая компания', 'Передача: работа']) {
    await expect(tree(guest).getByText(other, { exact: true }), other).toHaveCount(0)
  }
  const home = treeCompany(guest, COMPANY_2)
  await expandClients(home)
  await expect(home.getByRole('link', { name: new RegExp(`${SECOND_SPACE}$`) })).toBeVisible()

  // «Гостевое»: доска открывается, карточки только читаются и комментируются
  await openBoard(guest, GUEST_SPACE, 'Задачи')
  const card = guest.getByRole('button', { name: 'Открыть RGUEST-1: Задача для гостя' })
  await expect(card).toBeVisible()
  await expect(guest.getByRole('button', { name: /^Добавить карточку/ })).toHaveCount(0)
  await card.click()
  const window = guest.getByRole('dialog', { name: 'Задача для гостя' })
  await expect(window).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
  await expect(window.getByRole('checkbox', { name: 'Срочно' })).toHaveCount(0)
  await expect(window.getByRole('textbox', { name: 'Новый комментарий' })).toBeVisible()

  // 2. Администратор пространства: «Гостевое» → «Участники»: у гостя бейдж «Гость», в выборе роли нет «Администратора»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openMembers(admin, GUEST_SPACE)
  const row = admin.getByRole('row').filter({ hasText: 'e2e-guest@selen.test' })
  await expect(row.getByText('Гость', { exact: true })).toBeVisible()
  await expect(chips(row.getByRole('cell').nth(1))).toHaveText(['Комментатор'])
  await row.getByRole('button', { name: `Изменить роли ${GUEST}` }).click()
  const guestRoles = admin.getByRole('dialog', { name: `Роли: ${GUEST}` })
  const guestChoice = guestRoles.getByRole('group', { name: 'Роли', exact: true })
  await expect(guestChoice.getByRole('button', { pressed: true })).toHaveText(['Комментатор'])
  await expect(guestChoice.getByRole('button')).toHaveText([
    'Редактор',
    'Комментатор',
    'Редактор — только свои карточки',
    'Комментатор — только свои карточки',
  ])
  await guestRoles.getByRole('button', { name: 'Отмена' }).click()
  await expect(guestRoles).toBeHidden()
  // Для сравнения: у сотрудника компании «Администратор» в выборе есть
  const own = admin.getByRole('row').filter({ hasText: 'e2e-admin@selen.test' })
  await own.getByRole('button', { name: 'Изменить роли E2E Администратор' }).click()
  const ownRoles = admin.getByRole('dialog', { name: 'Роли: E2E Администратор' })
  await expect(ownRoles.getByRole('group', { name: 'Роли', exact: true }).getByRole('button')).toHaveText([
    'Администратор',
    'Редактор',
    'Комментатор',
    'Редактор — только свои карточки',
    'Комментатор — только свои карточки',
  ])
  await ownRoles.getByRole('button', { name: 'Отмена' }).click()
  await expect(ownRoles).toBeHidden()
})
