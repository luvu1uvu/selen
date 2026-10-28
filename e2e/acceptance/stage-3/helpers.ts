import { expect, type Page } from '@playwright/test'

/** Общие шаги приёмочных автотестов этапа 3 (роль «Владелец», подэтап 3c). */

export const NOT_IN_TREE = 'Не видно в вашем дереве'
export const EMPTY_FOLDER_HINT = 'В папке нет ни одного пространства. Такие папки в дереве видит только Владелец'
export const ACTIONS_ONLY_OWNER = 'Действия с администраторами и Владельцем доступны только Владельцу'

export function tree(page: Page) {
  return page.getByRole('navigation', { name: 'Дерево' })
}

/** Строка папки в дереве — по точному названию (без папок, чьё название лишь начинается так же). */
export function treeFolder(page: Page, name: string) {
  return tree(page)
    .getByRole('button')
    .filter({ has: page.getByText(name, { exact: true }) })
}

/** Строка «Структуры» (папка или пространство) — по точному названию. */
export function structureRow(page: Page, name: string) {
  return page
    .getByRole('region', { name: 'Структура' })
    .getByRole('listitem')
    .filter({ has: page.getByText(name, { exact: true }) })
}

/** «Администрирование → Пользователи». */
export async function openUsers(page: Page) {
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
}

/** Строка пользователя в списке «Пользователи» — по имени. */
export function userRow(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('link', { name, exact: true }) })
}

/** Поле «Поиск по имени или email» над списком «Пользователи»: ввести запрос. */
export async function searchUsers(page: Page, query: string) {
  await page.getByRole('textbox', { name: 'Поиск по имени или email' }).fill(query)
}

/**
 * Найти человека в списке «Пользователи» поиском по имени — как сделал бы пользователь. В списке 25 человек на странице,
 * по имени: люди в конце алфавита (и приглашённые с кириллическими именами) уходят на следующие страницы, когда людей
 * в E2eSeeder становится больше. Возвращает строку человека.
 */
export async function findUser(page: Page, name: string) {
  await searchUsers(page, name)
  const row = userRow(page, name)
  await expect(row).toBeVisible()
  return row
}

/** Ячейка «Роль» в строке пользователя (колонки: Имя, Email, Роль…). */
export function roleCell(page: Page, name: string) {
  return userRow(page, name).getByRole('cell').nth(2)
}

/**
 * Диалог «Передать владение»: найти получателя по началу имени, выбрать, ввести пароль и отправить.
 * Возвращает диалог — проверки результата делает тест.
 */
export async function submitTransfer(page: Page, search: string, name: string, password: string) {
  await page.getByRole('button', { name: 'Передать владение' }).click()
  const dialog = page.getByRole('dialog', { name: 'Передать владение' })
  await dialog.getByLabel('Новый Владелец').fill(search)
  await dialog.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await dialog.getByLabel('Ваш пароль').fill(password)
  await dialog.getByRole('button', { name: 'Передать владение' }).click()
  return dialog
}
