import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Общие шаги приёмочных автотестов «Права 2.0», П2a (docs/stages/rights-2.md, «Как проверить руками (П2a…)»,
 * ТК-R2.1–R2.4): прежние сценарии прав не изменились.
 *
 * Данные — E2eSeeder::rights2 вместо демо-данных: «Разработка» → RROLES «Права: роли», «Эксплуатация» → RGROUPS
 * «Права: группы», «Компания» (открыта всем сотрудникам) → RALL «Права: для всех» (доступ «Всем сотрудникам» тест
 * выдаёт на время), «Маркетинг» с архивной группой «Стажёры» → RINTERN «Права: стажёры». Анна и Егор (администраторы
 * пространств) — e2e-admin, Борис (редактор) — e2e-editor, Вера (комментатор) — e2e-editor в RREAD «Права: чтение»,
 * Жанна («только свои карточки») — e2e-restricted, Григорий — «E2E Руководитель», Борис ТК-R2.3 (ему меняют роль) —
 * «E2E Участник ролей», Демо Участник — e2e-outsider.
 */

export const ROLES = 'Права: роли'
export const READ = 'Права: чтение'
export const GROUPS = 'Права: группы'
export const ALL = 'Права: для всех'
export const INTERNS = 'Права: стажёры'

export function tree(page: Page) {
  return page.getByRole('navigation', { name: 'Дерево' })
}

/** Ссылка пространства в дереве: перед названием может быть пометка «Доступно всем сотрудникам». */
export function spaceLink(page: Page, space: string) {
  return tree(page).getByRole('link', { name: new RegExp(`(^|\\s)${space}$`) })
}

/** Дерево → пространство → вкладка «Участники». */
export async function openMembers(page: Page, space: string) {
  await spaceLink(page, space).click()
  await expect(page.getByRole('heading', { name: space }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Участники', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Участники', exact: true })).toHaveAttribute('aria-selected', 'true')
}

/** Колонка доски (одна дорожка) — по названию. */
export const column = (page: Page, name: string) => page.getByRole('group', { name, exact: true })

/** Перетаскивание мышью по шагам: dnd-kit начинает перенос после смещения на 5 px (как board.spec). */
export async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 20 })
  await page.mouse.up()
}

/** Строка таблицы «Доступ к пространствам» (Администрирование → Пользователи → человек) — по ключу пространства. */
export function accessRow(page: Page, key: string) {
  return page.getByRole('row').filter({ has: page.getByText(key, { exact: true }) })
}

/** Ячейки строки «Доступ к пространствам»: «Итог» и «Источники». */
export const result = (row: Locator) => row.getByRole('cell').nth(1)
export const sources = (row: Locator) => row.getByRole('cell').nth(2)

/*
 * «Права 2.0», П2b-1 — компании (docs/stages/rights-2.md, «Как проверить руками (П2b-1…)», ТК-R2.5–R2.8): всё
 * в «Компании 1», для пользователей как раньше. Данные — E2eSeeder::companies: RCOMP «Права: компания» вместо
 * «Маркетинга», «Компании» и «Разработки» демо-данных (e2e-admin — его администратор: Анна и admin@ тест-кейсов),
 * люди, которые не входят в систему, — вместо «Демо Участника», «Бориса», «Дины».
 */
export const COMPANY_SPACE = 'Права: компания'
export const COMPANY_KEY = 'RCOMP'

/** Метка для одноразовых названий (группа, метка, тип, папка, приглашение): тест можно повторить на том же стеке. */
export const stamp = () => Date.now().toString(36)
