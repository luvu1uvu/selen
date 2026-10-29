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

/**
 * Выбор компании над меню «Администрирования» (только у того, у кого компаний несколько): кнопка «Компания: <текущая>»,
 * по ней — меню, пункты — компании (у текущей отметка).
 */
export const companyButton = (page: Page) =>
  page.getByRole('navigation', { name: 'Администрирование' }).getByRole('button', { name: /^Компания: / })

/** Открыть выбор компании; возвращает её пункты меню. */
export async function openCompanyMenu(page: Page) {
  await companyButton(page).click()
  const items = page.getByRole('menu').getByRole('menuitemcheckbox')
  await expect(items.first()).toBeVisible()
  return items
}

/** Выбрать компанию в меню — открывается тот же раздел админки в ней. */
export async function chooseCompany(page: Page, name: string) {
  await openCompanyMenu(page)
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(companyButton(page)).toHaveAccessibleName(`Компания: ${name}`)
}

/** Вкладки раздела «Пользователи»: ссылки «Пользователи», «Группы», «Приглашения». */
export const usersTabs = (page: Page) => page.getByRole('navigation', { name: 'Разделы «Пользователей»' })

/** Заголовок компании в дереве — область с её названием (только у того, у кого компаний несколько). */
export const treeCompany = (page: Page, name: string) => tree(page).getByRole('region', { name, exact: true })

/*
 * «Права 2.0», П2c-1 — гости, деактивация в компании, приглашения, права компании (docs/stages/rights-2.md, «Как
 * проверить руками (П2c-1…)», ТК-R2.16–R2.27). Данные — E2eSeeder::guestsAndRights и guestsAndRightsCases.
 */
export const GUEST_SPACE = 'Гостевое'
export const GUEST_KEY = 'RGUEST'
export const SECOND_SPACE = 'Вторая компания: продажи'
export const THIRD_SPACE = 'Третья компания: склад'

/** Администрирование → (выбор компании, если она задана) → «Пользователи». */
export async function openCompanyUsers(page: Page, company?: string) {
  await page.goto('/')
  const panel = await openAdminPanel(page)
  if (company) await chooseCompany(page, company)
  await panel.getByRole('link', { name: 'Пользователи', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  return panel
}

/** Кнопка «⋯» в строке пользователя списка «Пользователи». */
export const userActions = (page: Page, name: string) =>
  page.getByRole('button', { name: `Действия с пользователем «${name}»` })

/** «Администрирование» в полосе разделов (у кого нет ни одного права в админке — кнопки нет). */
export const adminRail = (page: Page) =>
  page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Администрирование' })

/** Папка «E2E Клиенты» второй компании в дереве: раскрыть, если свёрнута (в ней RSECOND). */
export async function expandClients(region: Locator) {
  const folder = region.getByRole('button').filter({ has: region.page().getByText('E2E Клиенты', { exact: true }) })
  await expect(folder).toBeVisible()
  if ((await folder.getAttribute('aria-expanded')) !== 'true') await folder.click()
}

/** Дата «ДД.ММ.ГГГГ» через `days` дней — как бейдж «Гость до …» у пользователя с часовым поясом Москвы. */
export function moscowDate(days: number) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(
    new Date(Date.now() + days * 24 * 3600 * 1000),
  )
}

/** То же — для поля даты (ГГГГ-ММ-ДД). */
export function moscowIsoDate(days: number) {
  return moscowDate(days).split('.').reverse().join('-')
}

/*
 * «Права 2.0», П2c-2 — активность, сеансы, смена email, журнал, права компании (docs/stages/rights-2.md, «Как проверить
 * руками (П2c-2)», ТК-R2.35–R2.44). Данные — E2eSeeder::sessionsAndEmail.
 */

/**
 * Ссылки из писем о смене email (в E2E письма уходят в лог, не в почту): запросы смены у «E2E Подтверждение email»
 * и «E2E Email к отмене» E2eSeeder создаёт с этими токенами (EMAIL_CHANGE_TOKEN, EMAIL_CANCEL_TOKEN).
 */
export const EMAIL_CHANGE_LINK = '/email-change/e2eEmailChangeToken0000000000000000000000000000000000000000000001'
export const EMAIL_CANCEL_LINK = '/email-change/e2eEmailChangeToken0000000000000000000000000000000000000000000002'

/** Администрирование → (выбор компании, если она задана) → «Журнал событий». */
export async function openCompanyEvents(page: Page, company?: string) {
  await page.goto('/')
  const panel = await openAdminPanel(page)
  if (company) await chooseCompany(page, company)
  await panel.getByRole('link', { name: 'Журнал событий', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Журнал событий', level: 1 })).toBeVisible()
}

/** Строки журнала с событием этого типа. Ячейки: Время, Событие, Кто, Объект, Подробности. */
export const eventRows = (page: Page, type: string) =>
  page
    .getByRole('main')
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: type, exact: true }) })

/** Ячейка «Кто» строки журнала: имя (или «Без входа»), у входов — IP и браузер. */
export const whoCell = (row: Locator) => row.getByRole('cell').nth(2)

/** Ячейка «Подробности» строки журнала. */
export const detailsCell = (row: Locator) => row.getByRole('cell').nth(4)

/*
 * «Права 2.0», П2d-1 — доступ через папки и несколько ролей (docs/stages/rights-2.md, «Как проверить руками (П2d-1…)»,
 * ТК-R2.45–R2.54). Данные — E2eSeeder::foldersAccess: Демо Участник → «E2E Ярослав Папкин» (e2e-folders@), Егор и Дина →
 * «E2E Яков Эксплуатации» и «E2E Яна Маркетинга», папки и пространства — «E2E Продуктовые команды» (FDEV), «E2E
 * Операции» (FOPS, FMKT) и другие; admin@ → e2e-admin (администратор «Компании 1»).
 */
export const FOLDERS_PERSON = 'E2E Ярослав Папкин'

/** Администрирование → «Структура». */
export async function openStructure(page: Page) {
  await page.goto('/admin/structure')
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
}

/** «Структура» → «⋯» у папки или пространства → пункт меню. */
export async function structureAction(page: Page, name: string, item: string) {
  await page.getByRole('button', { name: `Действия с «${name}»` }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

/** «Структура» → «⋯» → «Доступ…»: окно «Доступ: <название>» со списком выдач. */
export async function openNodeAccess(page: Page, name: string) {
  await structureAction(page, name, 'Доступ…')
  const dialog = page.getByRole('dialog', { name: `Доступ: ${name}` })
  await expect(dialog.getByRole('columnheader', { name: 'Кто' })).toBeVisible()
  return dialog
}

/**
 * Строки списка «Доступа…» с этим человеком или группой (выдача на сам узел и унаследованные — отдельными строками). По
 * подстроке: рядом с именем в той же ячейке — пометки («группа», «через папку …», «Приглашён»).
 */
export const grantRows = (dialog: Locator, name: string) => dialog.getByRole('row').filter({ hasText: name })

/** Чипы ролей (значки) в ячейке. */
export const chips = (cell: Locator) => cell.locator('[data-slot="badge"]')

/** Ячейка «Роли» строки «Доступа…»: кто, роли, действия. */
export const grantRoles = (row: Locator) => chips(row.getByRole('cell').nth(1))

/** Роли чипами (переключатели aria-pressed): включить нужные, выключить остальные. */
export async function chooseRoles(group: Locator, roles: string[]) {
  for (const chip of await group.getByRole('button').all()) {
    const name = (await chip.innerText()).trim()
    if (((await chip.getAttribute('aria-pressed')) === 'true') !== roles.includes(name)) await chip.click()
  }
  await expect(group.getByRole('button', { pressed: true })).toHaveText(roles)
}

/** В окне «Доступ…»: «Сотруднику» (поиск по имени) или «Группе», роли чипами → «Выдать доступ». */
export async function grantNodeAccess(dialog: Locator, subject: { user: string } | { group: string }, roles: string[]) {
  const page = dialog.page()
  if ('user' in subject) {
    await dialog.getByRole('button', { name: 'Сотруднику', exact: true }).click()
    await dialog.getByRole('textbox', { name: 'Сотрудник' }).fill(subject.user)
    await dialog.getByRole('button', { name: new RegExp(`^${subject.user} `) }).click()
  } else {
    await dialog.getByRole('button', { name: 'Группе', exact: true }).click()
    const select = dialog.getByLabel('Группа', { exact: true })
    const value = await select.locator('option', { hasText: subject.group }).getAttribute('value')
    await select.selectOption(value!)
  }
  await chooseRoles(dialog.getByRole('group', { name: 'Роли', exact: true }), roles)
  await dialog.getByRole('button', { name: 'Выдать доступ', exact: true }).click()
  await expect(page.getByText('Доступ выдан').first()).toBeVisible()
}

/** В окне «Доступ…»: «Снять доступ» у человека или группы (выдача на сам узел) → подтвердить. */
export async function revokeNodeAccess(dialog: Locator, name: string) {
  const page = dialog.page()
  await dialog.getByRole('button', { name: `Снять доступ: ${name}` }).click()
  await page.getByRole('dialog', { name: 'Снять доступ?' }).getByRole('button', { name: 'Снять доступ' }).click()
}

/** Закрыть окно «Доступ…» (крестик). */
export async function closeDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Пространство по адресу → вкладка «Участники» (пространство в папке: в дереве папка может быть свёрнута). */
export async function openMembersByKey(page: Page, key: string, name: string) {
  await page.goto(`/spaces/${key}`)
  await expect(page.getByRole('heading', { name }).first()).toBeVisible()
  await page.getByRole('tab', { name: 'Участники', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Участники', exact: true })).toHaveAttribute('aria-selected', 'true')
}

/**
 * Папка в дереве с содержимым — пункт списка, в котором её кнопка (по точному названию). Внутренний локатор filter({ has })
 * ищется внутри пункта — от страницы, а не от дерева.
 */
export const treeFolderItem = (page: Page, name: string) =>
  tree(page).getByRole('listitem').filter({ has: page.getByRole('button', { name, exact: true }) })
