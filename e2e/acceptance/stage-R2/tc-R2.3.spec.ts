import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { chips, chooseRoles, GROUPS, openMembers, ROLES } from './helpers'

/**
 * ТК-R2.3: управление участниками работает на новой модели так же, как раньше — смена роли, «только свои карточки»,
 * отказ последнему администратору. Анна (администратор «Разработки») и Егор (единственный администратор
 * «Эксплуатации») — e2e-admin, единственный личный администратор RROLES «Права: роли» и RGROUPS «Права: группы»;
 * Борис — «E2E Участник ролей» (редактор RROLES, в систему не входит), E2eSeeder::rights2.
 *
 * П2d-1: роли — чипами в окне «Роли: …» (кнопка «Изменить роли …» в строке), «только свои карточки» — не галочка,
 * а отдельные роли «Редактор — только свои карточки» и «Комментатор — только свои карточки»: включить «только свои»
 * Комментатору — роль «Комментатор — только свои карточки», выключить — снова «Комментатор». Отказ последнему
 * администратору — под полем ролей, окно остаётся открытым.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const MEMBER = 'E2E Участник ролей'
const ADMIN = 'E2E Администратор'

/** Строка человека в «Участниках» → «Люди»: по кнопке «Изменить роли …». */
const row = (page: Page, name: string) =>
  page.getByRole('row').filter({ has: page.getByRole('button', { name: `Изменить роли ${name}` }) })

/** Личные роли человека на пространстве — чипы в столбце «Личные роли». */
const personalRoles = (page: Page, name: string) => chips(row(page, name).getByRole('cell').nth(1))

/** «Изменить роли …» → окно «Роли: …» → роли чипами → «Сохранить». */
async function openRoles(page: Page, name: string, roles: string[]) {
  await page.getByRole('button', { name: `Изменить роли ${name}` }).click()
  const dialog = page.getByRole('dialog', { name: `Роли: ${name}` })
  await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), roles)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  return dialog
}

async function setRoles(page: Page, name: string, roles: string[]) {
  const dialog = await openRoles(page, name, roles)
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Роли изменены').first()).toBeVisible()
  await expect(personalRoles(page, name)).toHaveText(roles)
}

/** Обновить страницу и снова открыть «Участники» (вкладка не запоминается в адресе). */
async function reloadMembers(page: Page, space: string) {
  await openHome(page)
  await openMembers(page, space)
}

test('ТК-R2.3. Участники: смена роли, «только свои», последний администратор @tc-R2.3', async ({ page }) => {
  // 1. «Разработка» → «Участники»: Борису — «Комментатор»
  await openHome(page)
  await openMembers(page, ROLES)
  await expect(personalRoles(page, MEMBER)).toHaveText(['Редактор'])
  await setRoles(page, MEMBER, ['Комментатор'])
  await expect(row(page, MEMBER)).toContainText('Лично: Комментатор')

  // 2. Включить «только свои карточки» (роль «Комментатор — только свои карточки») — остаётся после обновления страницы
  await setRoles(page, MEMBER, ['Комментатор — только свои карточки'])
  await reloadMembers(page, ROLES)
  await expect(personalRoles(page, MEMBER)).toHaveText(['Комментатор — только свои карточки'])
  await expect(row(page, MEMBER)).toContainText('Лично: Комментатор — только свои карточки')

  // Выключить, вернуть роль «Редактор» — и после обновления так же
  await setRoles(page, MEMBER, ['Комментатор'])
  await setRoles(page, MEMBER, ['Редактор'])
  await reloadMembers(page, ROLES)
  await expect(personalRoles(page, MEMBER)).toHaveText(['Редактор'])
  await expect(row(page, MEMBER)).toContainText('Лично: Редактор')
  await expect(row(page, MEMBER)).not.toContainText('только свои карточки')

  // 3. «Эксплуатация» → «Участники»: единственный администратор ставит себе «Редактор» — отказ, роль прежняя
  await openMembers(page, GROUPS)
  await expect(personalRoles(page, ADMIN)).toHaveText(['Администратор'])
  const dialog = await openRoles(page, ADMIN, ['Редактор'])
  await expect(dialog).toContainText('Нельзя оставить пространство без администратора: сначала назначьте другого.')
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
  await expect(personalRoles(page, ADMIN)).toHaveText(['Администратор'])
  await reloadMembers(page, GROUPS)
  await expect(personalRoles(page, ADMIN)).toHaveText(['Администратор'])
  await expect(row(page, ADMIN)).toContainText('Лично: Администратор')
})
