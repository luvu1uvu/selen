import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { GROUPS, openMembers, ROLES } from './helpers'

/**
 * ТК-R2.3: управление участниками работает на новой модели так же, как раньше — смена роли, «только свои карточки»,
 * отказ последнему администратору. Анна (администратор «Разработки») и Егор (единственный администратор
 * «Эксплуатации») — e2e-admin, единственный личный администратор RROLES «Права: роли» и RGROUPS «Права: группы»;
 * Борис — «E2E Участник ролей» (редактор RROLES, в систему не входит), E2eSeeder::rights2.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const MEMBER = 'E2E Участник ролей'
const ADMIN = 'E2E Администратор'

const role = (page: Page, name: string) => page.getByRole('combobox', { name: `Роль ${name}` })
const ownOnly = (page: Page, name: string) => page.getByRole('checkbox', { name: `Только свои карточки: ${name}` })
const row = (page: Page, name: string) => page.getByRole('row').filter({ has: role(page, name) })

/** Обновить страницу и снова открыть «Участники» (вкладка не запоминается в адресе). */
async function reloadMembers(page: Page, space: string) {
  await openHome(page)
  await openMembers(page, space)
}

test('ТК-R2.3. Участники: смена роли, «только свои», последний администратор @tc-R2.3', async ({ page }) => {
  // 1. «Разработка» → «Участники»: Борису — «Комментатор»
  await openHome(page)
  await openMembers(page, ROLES)
  await expect(role(page, MEMBER).locator('option:checked')).toHaveText('Редактор')
  await role(page, MEMBER).selectOption({ label: 'Комментатор' })
  await expect(page.getByText('Роль изменена')).toBeVisible()
  await expect(role(page, MEMBER).locator('option:checked')).toHaveText('Комментатор')
  await expect(row(page, MEMBER)).toContainText('Лично: Комментатор')

  // 2. Включить «Только свои карточки» — меняется сразу и остаётся после обновления страницы
  await ownOnly(page, MEMBER).click()
  await expect(page.getByText('Режим «только свои карточки» включён')).toBeVisible()
  await expect(ownOnly(page, MEMBER)).toBeChecked()
  await reloadMembers(page, ROLES)
  await expect(role(page, MEMBER).locator('option:checked')).toHaveText('Комментатор')
  await expect(ownOnly(page, MEMBER)).toBeChecked()
  await expect(row(page, MEMBER)).toContainText('Лично: Комментатор · Только свои карточки')

  // Выключить, вернуть роль «Редактор» — и после обновления так же
  await ownOnly(page, MEMBER).click()
  await expect(page.getByText('Режим «только свои карточки» выключен')).toBeVisible()
  await expect(ownOnly(page, MEMBER)).not.toBeChecked()
  await role(page, MEMBER).selectOption({ label: 'Редактор' })
  await expect(role(page, MEMBER).locator('option:checked')).toHaveText('Редактор')
  await reloadMembers(page, ROLES)
  await expect(role(page, MEMBER).locator('option:checked')).toHaveText('Редактор')
  await expect(ownOnly(page, MEMBER)).not.toBeChecked()
  await expect(row(page, MEMBER)).toContainText('Лично: Редактор')
  await expect(row(page, MEMBER)).not.toContainText('Лично: Редактор · Только свои карточки')

  // 3. «Эксплуатация» → «Участники»: единственный администратор ставит себе «Редактор» — отказ, роль прежняя
  await openMembers(page, GROUPS)
  await expect(role(page, ADMIN).locator('option:checked')).toHaveText('Администратор')
  await role(page, ADMIN).selectOption({ label: 'Редактор' })
  await expect(page.getByText('Нельзя оставить пространство без администратора: сначала назначьте другого.')).toBeVisible()
  await expect(role(page, ADMIN).locator('option:checked')).toHaveText('Администратор')
  await reloadMembers(page, GROUPS)
  await expect(role(page, ADMIN).locator('option:checked')).toHaveText('Администратор')
  await expect(row(page, ADMIN)).toContainText('Лично: Администратор')
})
