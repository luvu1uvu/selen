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

/** Открыть доску через дерево навигации: раскрыть пространство и перейти по ссылке доски. */
export async function openBoard(page: Page, space: string, board: string) {
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  await tree.getByRole('button', { name: `Раскрыть «${space}»` }).click()
  await tree.getByRole('link', { name: board, exact: true }).click()
  await expect(page.getByRole('heading', { name: board })).toBeVisible()
}
