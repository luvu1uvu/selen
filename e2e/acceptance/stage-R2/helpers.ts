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

/*
 * «Права 2.0», П2b-2 — несколько компаний (docs/stages/rights-2.md, «Как проверить руками (П2b-2…)», ТК-R2.9–R2.15).
 * Данные — E2eSeeder::moreCompanies вместо демо «Компании 2» и «Компании 3»: irina@ (администратор обеих) →
 * e2e-multi-admin, oleg@ (два «дома») → e2e-two-homes (входит) и «E2E Два дома без входа» (его деактивирует Владелец),
 * kirill@ (сотрудник второй компании) → e2e-multi-admin, zhanna@ («только свои») → e2e-restricted в QA.
 */
export const COMPANY_1 = 'Компания 1'
export const COMPANY_2 = 'E2E Компания 2'
export const COMPANY_3 = 'E2E Компания 3'

/** Уведомления по ссылке на недоступное (одинаковые для «нет доступа» и «нет такой», ADR-0024). */
export const NO_CARD = 'Нет доступа к карточке или она не существует'
export const NO_SPACE = 'Нет доступа к пространству или оно не существует'

/** «Администрирование» в полосе разделов: раздел панели запоминается — уже открытый повторное нажатие закрыло бы. */
export async function openAdminPanel(page: Page) {
  const rail = page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Администрирование' })
  await expect(rail).toBeVisible()
  if ((await rail.getAttribute('aria-pressed')) !== 'true') await rail.click()
  const panel = page.getByRole('navigation', { name: 'Администрирование' })
  await expect(panel).toBeVisible()
  return panel
}

/** Выбор компании над меню «Администрирования» (только у того, у кого компаний несколько). */
export const companySelect = (page: Page) =>
  page.getByRole('navigation', { name: 'Администрирование' }).getByLabel('Компания', { exact: true })

/** Вкладки раздела «Пользователи»: ссылки «Пользователи», «Группы», «Приглашения». */
export const usersTabs = (page: Page) => page.getByRole('navigation', { name: 'Разделы «Пользователей»' })

/** Заголовок компании в дереве — область с её названием (только у того, у кого компаний несколько). */
export const treeCompany = (page: Page, name: string) => tree(page).getByRole('region', { name, exact: true })
