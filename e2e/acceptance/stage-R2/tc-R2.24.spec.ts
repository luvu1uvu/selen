import { expect, test } from '@playwright/test'
import { pageAs } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { openAdminPanel, openCompanyUsers, usersTabs } from './helpers'

/**
 * ТК-R2.24: администратор поручает сотруднику одно действие в админке, не делая его администратором. admin@ → e2e-admin;
 * dina@ → «E2E Только приглашать» (e2e-rights@, участник «Компании 1»). В E2E-данных право «Приглашать пользователей»
 * у него уже выдано лично (E2eSeeder::guestsAndRights), поэтому шаг 1 снимает галочку и ставит снова — проверяется
 * сохранение, итог тот же, что после шага 1 тест-кейса. П2c-2: права «Журнал событий» и «Корзина» называются
 * «Смотреть журнал событий» и «Возвращать из корзины» (решение PM по отчёту П2c-1, п. 6).
 */

const PERSON = 'E2E Только приглашать'

test('ТК-R2.24. Права компании лично: только «приглашать» @tc-R2.24', async ({ browser }) => {
  // 1. «Пользователи» → человек (ссылка на имени) → «Права компании»: «Приглашать пользователей»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openCompanyUsers(admin)
  await userRow(admin, PERSON).getByRole('link', { name: PERSON, exact: true }).click()
  await expect(admin.getByRole('heading', { name: PERSON })).toBeVisible()
  const rights = admin.getByRole('region', { name: 'Права компании' })
  const invite = rights.getByRole('checkbox', { name: /^Приглашать пользователей/ })
  await expect(invite).toBeChecked()
  await invite.click()
  await expect(admin.getByText('Права сохранены')).toBeVisible()
  await expect(invite).not.toBeChecked()
  await invite.click()
  await expect(admin.getByText('Права сохранены').last()).toBeVisible()
  await expect(invite).toBeChecked()
  // Остальные права — не отмечены (названия прав — глаголом, решение PM по отчёту П2c-1, п. 6)
  for (const name of [
    'Управлять пользователями и гостями',
    'Управлять группами',
    'Смотреть журнал событий',
    'Возвращать из корзины',
  ]) {
    await expect(rights.getByRole('checkbox', { name: new RegExp(`^${name}`) }), name).not.toBeChecked()
  }

  // «Смотреть аналитику трудозатрат» — недоступна, подсказка «Это право выдаёт только Владелец»
  const analytics = rights.getByRole('checkbox', { name: /^Смотреть аналитику трудозатрат/ })
  await expect(analytics).toBeDisabled()
  await analytics.hover()
  await expect(admin.getByRole('tooltip')).toHaveText('Это право выдаёт только Владелец')

  // После обновления страницы — право на месте
  await admin.reload()
  await expect(admin.getByRole('region', { name: 'Права компании' }).getByRole('checkbox', { name: /^Приглашать пользователей/ })).toBeChecked()

  // 2. Сотрудник: «Администрирование» — только «Пользователи», в нём одна вкладка «Приглашения» с «Пригласить»
  const person = await pageAs(browser, 'e2e-rights@selen.test')
  const panel = await openAdminPanel(person)
  await expect(panel.getByRole('link')).toHaveText(['Пользователи'])
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(person).toHaveURL(/\/invitations$/)
  await expect(usersTabs(person).getByRole('link')).toHaveText(['Приглашения'])
  await expect(person.getByRole('button', { name: 'Пригласить' })).toBeVisible()
  await expect(person.getByRole('button', { name: 'Добавить гостя' })).toHaveCount(0)
})
