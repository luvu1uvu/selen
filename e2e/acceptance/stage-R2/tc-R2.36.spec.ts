import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { findUser } from '../stage-3/helpers'
import { COMPANY_1, eventRows, openCompanyEvents, openCompanyUsers, userActions, whoCell } from './helpers'

/**
 * ТК-R2.36: «Завершить все сеансы» выкидывает человека со всех устройств. owner@ → e2e-owner, anna@ → «E2E Сеансы»
 * (e2e-sessions@, E2eSeeder::sessionsAndEmail): окно инкогнито — его сохранённый вход в отдельном контексте. Шаг 4
 * (вход снова) — только вручную: вход через форму в автотестах запрещён (лимит входов), а сохранённый вход тест
 * завершает. После теста сохранённый вход e2e-sessions не действует — другие тесты его не используют. Человека тест
 * находит полем «Поиск по имени или email»: в списке 25 человек на странице.
 */

const PERSON = 'E2E Сеансы'

test('ТК-R2.36. «Завершить все сеансы» @tc-R2.36', async ({ browser }) => {
  // 1. Человек вошёл (сохранённый вход) и работает в Selen
  const person = await pageAs(browser, 'e2e-sessions@selen.test')

  // 2. Владелец: «Пользователи» → «⋯» → «Завершить все сеансы…»: окно → «Завершить сеансы»
  const owner = await pageAs(browser, 'e2e-owner@selen.test')
  await openCompanyUsers(owner, COMPANY_1)
  await findUser(owner, PERSON)
  await userActions(owner, PERSON).click()
  await owner.getByRole('menuitem', { name: 'Завершить все сеансы…' }).click()
  const dialog = owner.getByRole('dialog', { name: 'Завершить все сеансы?' })
  await expect(dialog).toContainText(`${PERSON} выйдет из Selen на всех устройствах`)
  await dialog.getByRole('button', { name: 'Завершить сеансы', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(owner.getByText('Все сеансы пользователя завершены')).toBeVisible()

  // 3. У человека после обновления страницы — страница входа
  await person.reload()
  await expect(person).toHaveURL(/\/login$/)
  await expect(person.getByRole('button', { name: 'Войти' })).toBeVisible()

  // 5. «Журнал событий», «Человек» — он: «Сеансы пользователя завершены», в «Кто» — Владелец
  await openCompanyEvents(owner, COMPANY_1)
  await owner.getByLabel('Человек').selectOption({ label: PERSON })
  await expect(whoCell(eventRows(owner, 'Сеансы пользователя завершены').first())).toHaveText('E2E Владелец')
})
