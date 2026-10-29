import { expect, test, type Page } from '@playwright/test'
import { openBoard, pageAs } from '../../tests/helpers'
import { chips, chooseRoles, FOLDERS_PERSON, openMembersByKey } from './helpers'

/**
 * ТК-R2.49: несколько ролей — «Комментатор» + «Редактор — только свои карточки»: видит все карточки, правит только свои
 * (право и карточку даёт одна роль, ADR-0012). admin@ → e2e-admin (администратор FROLES); Демо Участник → «E2E Ярослав
 * Папкин» (e2e-folders@, лично Редактор FROLES); «Разработка» → FROLES «Папки: роли», доска «Продукт», чужая карточка —
 * FROLES-1 «Чужая задача» (заказчик — e2e-admin) — E2eSeeder::foldersAccess. Название своей карточки — одноразовое;
 * в конце роль снова «Редактор» — тест можно повторить.
 */

const SPACE = 'Папки: роли'

/** «Участники» → «Изменить роли» у сотрудника → роли чипами → «Сохранить». */
async function setRoles(admin: Page, roles: string[]) {
  await admin.getByRole('button', { name: `Изменить роли ${FOLDERS_PERSON}` }).click()
  const dialog = admin.getByRole('dialog', { name: `Роли: ${FOLDERS_PERSON}` })
  await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), roles)
  await dialog.getByRole('button', { name: 'Сохранить' }).click()
  await expect(dialog).toBeHidden()
  await expect(admin.getByText('Роли изменены').first()).toBeVisible()
}

const personalRoles = (admin: Page) =>
  chips(
    admin
      .getByRole('row')
      .filter({ has: admin.getByRole('button', { name: `Изменить роли ${FOLDERS_PERSON}` }) })
      .getByRole('cell')
      .nth(1),
  )

test('ТК-R2.49. Несколько ролей: «Комментатор» + «Редактор — только свои карточки» @tc-R2.49', async ({ browser }) => {
  // 1–2. «Участники» → «Изменить роли»: вместо «Редактора» — «Комментатор» и «Редактор — только свои карточки»
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openMembersByKey(admin, 'FROLES', SPACE)
  await expect(personalRoles(admin)).toHaveText(['Редактор'])
  await setRoles(admin, ['Комментатор', 'Редактор — только свои карточки'])

  try {
    // Два чипа — и после обновления страницы
    await expect(personalRoles(admin)).toHaveText(['Комментатор', 'Редактор — только свои карточки'])
    await openMembersByKey(admin, 'FROLES', SPACE)
    await expect(personalRoles(admin)).toHaveText(['Комментатор', 'Редактор — только свои карточки'])

    // 3. Сотрудник: доска «Продукт» — видны все карточки, в том числе чужая
    const person = await pageAs(browser, 'e2e-folders@selen.test')
    await openBoard(person, SPACE, 'Продукт')
    const foreign = person.getByRole('button', { name: 'Открыть FROLES-1: Чужая задача' })
    await expect(foreign).toBeVisible()

    // 4. Чужая карточка: название и поля не редактируются, комментировать можно
    await foreign.click()
    const window = person.getByRole('dialog', { name: 'Чужая задача' })
    await expect(window.getByRole('textbox', { name: 'Новый комментарий' })).toBeVisible()
    await expect(window.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
    await expect(window.getByRole('checkbox', { name: 'Срочно' })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Назначить' })).toHaveCount(0)
    await window.getByRole('button', { name: 'Закрыть', exact: true }).click()
    await expect(window).toBeHidden()

    // Своя карточка: создать в To Do и открыть — редактировать можно
    const title = `Своя карточка ${Date.now().toString(36)}`
    await person.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
    await person.getByRole('textbox', { name: 'Добавить карточку в начало To Do' }).fill(title)
    await person.keyboard.press('Enter')
    const own = person.getByRole('button', { name: new RegExp(`^Открыть FROLES-\\d+: ${title}$`) })
    await expect(own).toBeVisible()
    await person.keyboard.press('Escape')
    await own.click()
    const ownWindow = person.getByRole('dialog', { name: title })
    await expect(ownWindow.getByRole('textbox', { name: 'Название' })).toBeEditable()
    await expect(ownWindow.getByRole('checkbox', { name: 'Срочно' })).toBeEnabled()
    await expect(ownWindow.getByRole('textbox', { name: 'Новый комментарий' })).toBeVisible()
  } finally {
    // Вернуть как было: роль «Редактор»
    await openMembersByKey(admin, 'FROLES', SPACE)
    await setRoles(admin, ['Редактор'])
    await expect(personalRoles(admin)).toHaveText(['Редактор'])
  }
})
