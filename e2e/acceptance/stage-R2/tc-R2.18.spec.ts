import { expect, test } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import {
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
  const role = row.getByRole('combobox', { name: `Роль ${GUEST}` })
  await expect(role).toHaveValue('commenter')
  await expect(role.getByRole('option')).toHaveText(['Редактор', 'Комментатор'])
  // Для сравнения: у сотрудника компании «Администратор» в выборе есть
  const own = admin.getByRole('row').filter({ hasText: 'e2e-admin@selen.test' })
  await expect(own.getByRole('combobox', { name: 'Роль E2E Администратор' }).getByRole('option')).toHaveText([
    'Администратор',
    'Редактор',
    'Комментатор',
  ])
})
