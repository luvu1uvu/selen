import { fileURLToPath } from 'node:url'
import { expect, type Browser, type Page } from '@playwright/test'

/** Пароль всех пользователей E2eSeeder (UserFactory::PASSWORD). */
export const PASSWORD = 'password-123'

/** Пользователи E2eSeeder. Каждый входит один раз за прогон — в auth.setup.ts. */
export const USERS = [
  'e2e-owner@selen.test',
  'e2e-admin@selen.test',
  'e2e-editor@selen.test',
  'e2e-outsider@selen.test',
  'e2e-restricted@selen.test',
  'e2e-analyst@selen.test',
  // «Права 2.0», П2b-2: администратор двух компаний и человек с «домами» в двух компаниях (E2eSeeder::moreCompanies)
  'e2e-multi-admin@selen.test',
  'e2e-two-homes@selen.test',
  // «Права 2.0», П2c-1 (E2eSeeder::guestsAndRights, guestsAndRightsCases): гости, убранный из второй компании, право
  // «приглашать», отключаемая учётная запись (ТК-R2.21 завершает её сеанс), приглашаемая сотрудница другой компании
  'e2e-guest@selen.test',
  'e2e-guest-candidate@selen.test',
  'e2e-partly@selen.test',
  'e2e-rights@selen.test',
  'e2e-blocked@selen.test',
  'e2e-invitee@selen.test',
  // «Права 2.0», П2c-2 (E2eSeeder::sessionsAndEmail): «Завершить все сеансы…» завершает его сохранённый вход
  'e2e-sessions@selen.test',
  // «Права 2.0», П2d-1 (E2eSeeder::foldersAccess): доступ через папки и несколько ролей — вместо Демо Участника
  'e2e-folders@selen.test',
  // «Редизайн», шаг 2: сохранённая тема «Тёмная» (E2eSeeder::darkTheme) — проект «dark», acceptance/stage-RD2
  'e2e-dark@selen.test',
] as const

export type User = (typeof USERS)[number]

/**
 * Сохранённый вход пользователя (cookie сессии и XSRF): готовит auth.setup.ts, тесты подключают его через
 * `test.use({ storageState: authFile(...) })` или `browser.newContext({ storageState: authFile(...) })`.
 * Настоящий вход через форму — только в auth.setup.ts и auth.spec.ts: лимит входов 5 в минуту на пользователя
 * и 20 на IP (AppServiceProvider).
 */
export function authFile(user: User) {
  return fileURLToPath(new URL(`../.auth/${user}.json`, import.meta.url))
}

/** Вход через форму. В тестах — только там, где проверяется сам вход. */
export async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
}

/** Главная страница вошедшего пользователя. */
export async function openHome(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
}

/** Отдельный браузерный контекст под пользователем (для сценариев с несколькими людьми), на главной. */
export async function pageAs(browser: Browser, user: User) {
  const page = await (await browser.newContext({ storageState: authFile(user) })).newPage()
  await openHome(page)
  return page
}

/**
 * Открыть доску её отдельной страницей (/boards/ID — одна доска, как по ссылке «Поделиться»): найти доску в дереве
 * навигации и перейти на её страницу. Ссылка доски в дереве ведёт на страницу пространства, где все его доски рядами
 * (`/spaces/KEY?board=ID`, ADR-0019), — её проверяют space.spec и board-rows.spec; тесты страницы одной доски (блок
 * доски, прокрутка, дорожки, перенос карточек) открывают её здесь, как до рядов.
 */
export async function openBoard(page: Page, space: string, board: string) {
  const tree = await expandSpace(page, space)
  const href = await tree.getByRole('link', { name: board, exact: true }).getAttribute('href')
  const id = new URL(href!, 'http://selen').searchParams.get('board')
  await page.goto(`/boards/${id}`)
  await expect(page.getByRole('heading', { name: board })).toBeVisible()
}

/** Открыть доску из дерева, как пользователь: страница пространства, холст прокручен к доске (ADR-0019). */
export async function openSpaceBoard(page: Page, space: string, board: string) {
  const tree = await expandSpace(page, space)
  await tree.getByRole('link', { name: board, exact: true }).click()
  await expect(page.getByRole('heading', { name: board, exact: true })).toBeVisible()
}

/** Раскрыть пространство в дереве, если оно ещё свёрнуто (раскрытое запоминается в браузере и после перехода). */
async function expandSpace(page: Page, space: string) {
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  const toggle = tree.getByRole('button', { name: new RegExp(`^(Раскрыть|Свернуть) «${space}»$`) })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  return tree
}
