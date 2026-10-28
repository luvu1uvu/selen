import { expect, test, type Page } from '@playwright/test'
import { authFile, pageAs } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { COMPANY_1, openCompanyUsers, userActions } from './helpers'

/**
 * ТК-R2.21: Владелец закрывает вход во все компании сразу, администратор вернуть не может. owner@ → e2e-owner, admin@ →
 * e2e-admin, member@ («Демо Участник») → «E2E Отключаемый» (e2e-blocked@, E2eSeeder::guestsAndRightsCases). «Вход
 * не удаётся» скрипт проверяет по сохранённому входу отключённого: сеанс завершён, страница отправляет на вход (вход
 * через форму в автотестах запрещён — лимит входов). «member@ снова входит» после включения — только вручную (его
 * сохранённый вход завершён отключением). Тест возвращает учётную запись в «Активен» — его можно повторить.
 */

const PERSON = 'E2E Отключаемый'

const status = (page: Page) => userRow(page, PERSON).getByRole('cell').nth(3)

test('ТК-R2.21. Отключить учётную запись — только Владелец @tc-R2.21', async ({ browser }) => {
  // 1. Владелец: «Пользователи» «Компании 1» → «⋯» → «Отключить учётную запись…» → подтвердить
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_1)
  await expect(status(owner)).toHaveText('Активен')
  await userActions(owner, PERSON).click()
  await owner.getByRole('menuitem', { name: 'Отключить учётную запись…' }).click()
  const confirm = owner.getByRole('dialog', { name: 'Отключить учётную запись?' })
  await expect(confirm).toContainText('не сможет войти ни в одну компанию')
  await confirm.getByRole('button', { name: 'Отключить учётную запись', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(owner.getByText('Учётная запись отключена')).toBeVisible()
  await expect(status(owner)).toHaveText('Отключён Владельцем')

  // 2. Отключённый: его сеанс завершён — открыть Selen нельзя, только страница входа
  const blocked = await (await browser.newContext({ storageState: authFile('e2e-blocked@selen.test') })).newPage()
  await blocked.goto('/')
  await expect(blocked).toHaveURL(/\/login$/)
  await expect(blocked.getByRole('button', { name: 'Войти' })).toBeVisible()

  // 3. Администратор компании: статус «Отключён Владельцем», меню «⋯» нет
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  await expect(status(admin)).toHaveText('Отключён Владельцем')
  await expect(userActions(admin, PERSON)).toHaveCount(0)

  // 4. Владелец: «⋯» → «Включить учётную запись» — «Активен»
  await userActions(owner, PERSON).click()
  await owner.getByRole('menuitem', { name: 'Включить учётную запись' }).click()
  await expect(owner.getByText('Учётная запись включена')).toBeVisible()
  await expect(status(owner)).toHaveText('Активен')
  // У администратора — снова «Активен» и меню действий
  await admin.reload()
  await expect(status(admin)).toHaveText('Активен')
  await expect(userActions(admin, PERSON)).toBeVisible()
})
