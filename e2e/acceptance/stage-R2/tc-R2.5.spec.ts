import { expect, test, type Page } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { openUsers, roleCell, userRow } from '../stage-3/helpers'
import { stamp } from './helpers'

/**
 * ТК-R2.5: системные администраторы стали администраторами «Компании 1» — список людей, смена роли и приглашения
 * работают как прежде. owner@ → e2e-owner, admin@ → e2e-admin, «Демо Участник» → «E2E Роль компании» (участник,
 * в систему не входит), деактивированный — «E2E Деактивированный» (E2eSeeder::companies). Приглашение — с одноразовыми
 * именем и email (тест можно повторить).
 */

const MEMBER = 'E2E Роль компании'
const DEACTIVATED = 'E2E Деактивированный'

const actions = (page: Page, name: string) =>
  userRow(page, name).getByRole('button', { name: `Действия с пользователем «${name}»` })
const statusCell = (page: Page, name: string) => userRow(page, name).getByRole('cell').nth(3)

/** «⋯» строки → «Сделать администратором» / «Сделать участником». */
async function changeRole(page: Page, name: string, item: 'Сделать администратором' | 'Сделать участником') {
  await actions(page, name).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Список «Пользователи» — как раньше: люди, их роли и пометка деактивированного. */
async function expectUsers(page: Page) {
  await expect(roleCell(page, 'E2E Владелец')).toHaveText('Владелец')
  await expect(roleCell(page, 'E2E Администратор')).toHaveText('Администратор')
  for (const name of ['E2E Редактор', 'E2E Посторонний', 'E2E Подрядчик', MEMBER]) {
    await expect(roleCell(page, name), name).toHaveText('Участник')
    await expect(statusCell(page, name), name).toHaveText('Активен')
  }
  await expect(statusCell(page, DEACTIVATED)).toHaveText('Деактивирован')
}

test('ТК-R2.5. Пользователи, роли и приглашения в админке — как раньше @tc-R2.5', async ({ browser }) => {
  const id = stamp()
  const inviteName = `Проверка ТК ${id}`
  const inviteEmail = `tk-r25-${id}@selen.test`

  // 1. Владелец: Администрирование → Пользователи — все сотрудники, роли, деактивированный с пометкой
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openUsers(owner)
  await expectUsers(owner)

  // 2. «Сделать администратором» — роль меняется сразу и остаётся после обновления страницы
  await changeRole(owner, MEMBER, 'Сделать администратором')
  await expect(roleCell(owner, MEMBER)).toHaveText('Администратор')
  await owner.reload()
  await expect(roleCell(owner, MEMBER)).toHaveText('Администратор')

  // К шагу 4: пока он администратор, у администратора компании в его строке нет действий (только «Доступ»)
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openUsers(admin)
  await expect(roleCell(admin, MEMBER)).toHaveText('Администратор')
  await expect(actions(admin, MEMBER)).toHaveCount(0)
  await expect(userRow(admin, MEMBER).getByRole('link', { name: 'Доступ к пространствам' })).toBeVisible()

  // Вернуть «Участник» — сразу и после обновления страницы
  await changeRole(owner, MEMBER, 'Сделать участником')
  await expect(roleCell(owner, MEMBER)).toHaveText('Участник')
  await owner.reload()
  await expect(roleCell(owner, MEMBER)).toHaveText('Участник')

  // 3. «Пригласить»: имя, email, роль «Участник» → в приглашениях — ожидает принятия
  await owner.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = owner.getByRole('dialog', { name: 'Пригласить пользователя' })
  await dialog.getByLabel('Имя и фамилия').fill(inviteName)
  await dialog.getByLabel('Рабочий email').fill(inviteEmail)
  await dialog.getByLabel('Роль').selectOption({ label: 'Участник' })
  await dialog.getByRole('button', { name: 'Отправить приглашение' }).click()
  await expect(owner.getByText(`Приглашение отправлено на ${inviteEmail}`)).toBeVisible()
  await expect(dialog).toBeHidden()
  await owner.getByRole('tab', { name: 'Приглашения' }).click()
  const invitation = owner.getByRole('row').filter({ hasText: inviteEmail })
  await expect(invitation).toContainText(inviteName)
  await expect(invitation).toContainText('Участник')
  await expect(invitation).toContainText('Ожидает принятия')

  // 4. Администратор компании: тот же список (и приглашённый)
  await openUsers(admin)
  await expectUsers(admin)
  await expect(statusCell(admin, inviteName)).toHaveText('Приглашён')

  // У Владельца и администраторов нет действий смены роли и деактивации — только «Доступ к пространствам»
  for (const name of ['E2E Владелец', 'E2E Администратор']) {
    await expect(actions(admin, name), name).toHaveCount(0)
    await expect(userRow(admin, name).getByRole('link', { name: 'Доступ к пространствам' }), name).toBeVisible()
  }
  // У участника «Деактивировать» есть; роль (администраторы) — только у Владельца, как раньше (ADR-0017)
  await actions(admin, MEMBER).click()
  await expect(admin.getByRole('menuitem', { name: 'Деактивировать' })).toBeVisible()
  await expect(admin.getByRole('menuitem', { name: /^Сделать / })).toHaveCount(0)
  await admin.keyboard.press('Escape')
  await expect(admin.getByRole('menu')).toHaveCount(0)
})
