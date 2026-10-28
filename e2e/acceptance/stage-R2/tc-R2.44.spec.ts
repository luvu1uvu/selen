import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { openCompanyUsers, userActions } from './helpers'

/**
 * ТК-R2.44: из текстов окон понятно, кто вернёт человека после деактивации и после отключения учётной записи (UX-ревью
 * U-2, решения PM 28.10 по отчёту «Одна компания на копию», п. 3 и 4). owner@ → e2e-owner, «Демо Участник» → «E2E
 * Посторонний», «Демо Деактивированный» → «E2E Деактивированный» (E2eSeeder::companies). Все окна закрываются
 * «Отменой» — данные не меняются. Тест-кейс — в режиме «одна компания»: тег @single-company — второй прогон
 * scripts/e2e.sh.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const PERSON = 'E2E Посторонний'
const DEACTIVATED = 'E2E Деактивированный'

const status = (page: Page, name: string) => userRow(page, name).getByRole('cell').nth(3)

test('ТК-R2.44. Окна деактивации и отключения — кто вернёт человека @tc-R2.44 @single-company', async ({ page }) => {
  await openCompanyUsers(page)
  await expect(status(page, PERSON)).toHaveText('Активен')
  await expect(status(page, DEACTIVATED)).toHaveText('Деактивирован')

  // 1. «⋯» у участника → «Деактивировать…»: вернёт любой администратор; подсказка «Передать доступ…» — без «этой»
  await userActions(page, PERSON).click()
  await page.getByRole('menuitem', { name: 'Деактивировать…' }).click()
  const deactivate = page.getByRole('dialog', { name: 'Деактивировать пользователя?' })
  await expect(deactivate).toHaveAccessibleDescription(
    `${PERSON} сразу потеряет доступ к пространствам, группам и правам компании и не сможет войти, все сеансы ` +
      'завершатся. Данные и история сохранятся. Вернуть может любой администратор — пункт «Активировать» в меню «⋯».',
  )
  await expect(deactivate.getByText(/^Сотрудник получит личные роли уходящего/)).toContainText(
    'Сотрудник получит личные роли уходящего в пространствах компании, его группы и права компании.',
  )
  await expect(deactivate).not.toContainText('этой компании')
  await deactivate.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(deactivate).toBeHidden()

  // 2. «⋯» → «Отключить учётную запись…»: включить может только Владелец, доступ вернётся вместе с учётной записью
  await userActions(page, PERSON).click()
  await page.getByRole('menuitem', { name: 'Отключить учётную запись…' }).click()
  const block = page.getByRole('dialog', { name: 'Отключить учётную запись?' })
  await expect(block).toHaveAccessibleDescription(
    `${PERSON} не сможет войти, все сеансы завершатся — как при деактивации, но включить учётную запись можете ` +
      'только вы: администраторы компании её не вернут. Доступ к пространствам, группы и права компании сохранятся ' +
      'и вернутся вместе с учётной записью.',
  )
  await block.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(block).toBeHidden()

  // 3. «⋯» у деактивированного → «Отключить учётную запись…»: свой текст
  await userActions(page, DEACTIVATED).click()
  await page.getByRole('menuitem', { name: 'Отключить учётную запись…' }).click()
  await expect(block).toHaveAccessibleDescription(
    'Человек уже не может войти. После отключения вернуть его сможет только Владелец.',
  )
  await block.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(block).toBeHidden()

  // После «Отмены» статусы не изменились
  await expect(status(page, PERSON)).toHaveText('Активен')
  await expect(status(page, DEACTIVATED)).toHaveText('Деактивирован')
})
