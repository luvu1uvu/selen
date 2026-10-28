import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { openCompanyUsers, userActions } from './helpers'

/**
 * ТК-R2.32: в копии одной команды (ADR-0026) тексты деактивации и отключения учётной записи — без других компаний.
 * owner@ → e2e-owner, «Демо Участник» → «E2E Посторонний» (e2e-outsider, участник «Компании 1»). Оба окна закрываются
 * «Отменой» — данные не меняются. Тег @single-company — второй прогон scripts/e2e.sh.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const PERSON = 'E2E Посторонний'

const status = (page: Page) => userRow(page, PERSON).getByRole('cell').nth(3)

test('ТК-R2.32. Деактивация и отключение учётной записи — без «других компаний» @tc-R2.32 @single-company', async ({
  page,
}) => {
  // 1. «Пользователи» → «⋯» у человека → «Деактивировать…»
  await openCompanyUsers(page)
  await expect(status(page)).toHaveText('Активен')
  await userActions(page, PERSON).click()
  await page.getByRole('menuitem', { name: 'Деактивировать…' }).click()

  // 2. Окно — «Деактивировать пользователя?», текст без «других компаний» → «Отмена»
  const deactivate = page.getByRole('dialog', { name: 'Деактивировать пользователя?' })
  await expect(deactivate).toBeVisible()
  await expect(deactivate.getByRole('heading', { name: 'Деактивировать пользователя?' })).toBeVisible()
  await expect(deactivate).toContainText(
    `${PERSON} сразу потеряет доступ к пространствам, группам и правам компании и не сможет войти`,
  )
  await expect(deactivate).not.toContainText('других компаний')
  await deactivate.getByRole('button', { name: 'Отмена' }).click()
  await expect(deactivate).toBeHidden()
  await expect(status(page)).toHaveText('Активен')

  // 3. «⋯» → «Отключить учётную запись…»: текст без «ни в одну компанию» и «Членство в компаниях» → «Отмена»
  await userActions(page, PERSON).click()
  await page.getByRole('menuitem', { name: 'Отключить учётную запись…' }).click()
  const block = page.getByRole('dialog', { name: 'Отключить учётную запись?' })
  await expect(block).toBeVisible()
  await expect(block).toContainText(
    `${PERSON} не сможет войти, все сеансы завершатся. Данные и история сохранятся; включить учётную запись можете ` +
      'только вы — администраторы компании её не вернут.',
  )
  await expect(block).not.toContainText('ни в одну компанию')
  await expect(block).not.toContainText('Членство в компаниях')
  await block.getByRole('button', { name: 'Отмена' }).click()
  await expect(block).toBeHidden()

  // После «Отмены» — по-прежнему «Активен»
  await expect(status(page)).toHaveText('Активен')
})
