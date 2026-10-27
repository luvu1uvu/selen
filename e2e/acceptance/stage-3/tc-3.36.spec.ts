import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { authFile, type User } from '../../tests/helpers'

/**
 * ТК-3.36 (LATER-57, ручная проверка PM): вкладка А — администратор с открытой карточкой; во вкладке Б того же
 * браузера вышли и вошли другим пользователем (cookie сессии общие); во вкладке А без обновления — действие.
 * Действие не выполняется: ни от имени нового пользователя, ни молча.
 *
 * Данные E2eSeeder: карточка QA-1 «Существующая задача»; другой пользователь — e2e-editor (editor в QA: без
 * исправления действие прошло бы от его имени, у Владельца в QA роли нет). Вход в соседней вкладке — подмена cookie
 * контекста из storageState (выход через меню завершил бы общую для прогона сессию).
 * «Вкладка открыта до обновления кода» — запросы без X-Selen-User (заголовок убирается из запросов страницы).
 */

const SESSION_CHANGED =
  'В этом браузере выполнен вход под другим пользователем. Действие не выполнено — страница обновится под ним.'
const SESSION_UNVERIFIED = 'Страница устарела. Действие не выполнено — обновите страницу.'

/** Вкладка А: администратор, открыта карточка QA-1. */
async function adminTabWithCard(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ storageState: authFile('e2e-admin@selen.test') })
  const page = await context.newPage()
  await page.goto('/cards/QA-1')
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название', exact: true })).toHaveValue(/./)
  return { context, page }
}

/**
 * Во вкладке Б того же браузера вошёл другой пользователь: cookie сессии — его. Сначала дождаться, пока запросы
 * вкладки А завершатся: каждый ответ Laravel заново ставит cookie сессии и вернул бы прежнего пользователя.
 */
async function anotherTabLogsIn(page: Page, context: BrowserContext, user: User) {
  await page.waitForLoadState('networkidle')
  const state = JSON.parse(readFileSync(authFile(user), 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0]
  }
  await context.clearCookies()
  await context.addCookies(state.cookies)
}

/** Вкладка открыта до обновления кода: её запросы уходят без X-Selen-User. */
async function asOutdatedTab(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const headers = { ...route.request().headers() }
    delete headers['x-selen-user']
    await route.continue({ headers })
  })
}

/** Карточка QA-1 глазами e2e-editor (отдельный контекст): комментарии и название. */
async function qa1AsEditor(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ storageState: authFile('e2e-editor@selen.test') })
  const page = await context.newPage()
  await page.goto('/cards/QA-1')
  const panel = page.getByRole('dialog')
  await expect(panel.getByRole('textbox', { name: 'Название', exact: true })).toHaveValue(/./)
  return { context, panel }
}

async function sendComment(page: Page, text: string) {
  const panel = page.getByRole('dialog')
  await panel.getByRole('textbox', { name: 'Новый комментарий' }).fill(text)
  await panel.getByRole('button', { name: 'Отправить' }).click()
}

test('ТК-3.36. Действие во вкладке, где вошли под другим пользователем, не выполняется @tc-3.36', async ({
  browser,
}) => {
  // 1. Вкладка с текущим кодом: комментарий не создан, понятное сообщение, вкладка перешла к новому пользователю
  {
    const { context, page } = await adminTabWithCard(browser)
    const adminWindow = await page.getByRole('dialog').elementHandle()
    await anotherTabLogsIn(page, context, 'e2e-editor@selen.test')
    await sendComment(page, 'ТК-3.36: вкладка с текущим кодом')
    await expect(page.getByText(SESSION_CHANGED)).toBeVisible()
    // Данные перечитаны под новым пользователем: доска перезагрузилась — окно администратора убрано, открыто новое.
    // Пока окно открыто, шапка под ним скрыта от экранного диктора (aria-hidden, модальное окно); раньше тест ждал кнопку
    // меню сразу и ловил ~100 мс, пока окна нет на время перезагрузки доски, — под нагрузкой промахивался (LATER-110)
    await expect.poll(() => adminWindow!.evaluate((element) => element.isConnected)).toBe(false)
    await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название', exact: true })).toHaveValue(/./)
    // Окно закрыто — в шапке, видной диктору, новый пользователь
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Меню пользователя' })).toContainText('E2E Редактор')
    await context.close()
  }

  // 2. Вкладка, открытая до обновления кода (запросы без заголовка): комментарий тоже не создан
  {
    const { context, page } = await adminTabWithCard(browser)
    await asOutdatedTab(page)
    await anotherTabLogsIn(page, context, 'e2e-editor@selen.test')
    await sendComment(page, 'ТК-3.36: вкладка без заголовка')
    await expect(page.getByText(SESSION_UNVERIFIED)).toBeVisible()
    await context.close()
  }

  // 3. Там же — изменение поля карточки (название): не применено
  {
    const { context, page } = await adminTabWithCard(browser)
    await asOutdatedTab(page)
    await anotherTabLogsIn(page, context, 'e2e-editor@selen.test')
    const title = page.getByRole('dialog').getByRole('textbox', { name: 'Название', exact: true })
    await title.fill('ТК-3.36: чужое название')
    await title.press('Enter')
    await expect(page.getByText(SESSION_UNVERIFIED)).toBeVisible()
    await context.close()
  }

  // Ни один комментарий не создан, название не изменилось — глазами e2e-editor
  const editor = await qa1AsEditor(browser)
  await expect(editor.panel.getByRole('textbox', { name: 'Название', exact: true })).not.toHaveValue('ТК-3.36: чужое название')
  await expect(editor.panel.getByText(/ТК-3\.36:/)).toHaveCount(0)
  await editor.context.close()
})

test('ТК-3.36. Запрос с сессией без X-Selen-User не выполняется молча @tc-3.36', async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile('e2e-editor@selen.test') })
  const page = await context.newPage()
  await page.goto('/cards/QA-1')
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название', exact: true })).toHaveValue(/./)
  const xsrf = (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? ''
  const headers = {
    Accept: 'application/json',
    Referer: new URL('/', page.url()).toString(),
    'X-XSRF-TOKEN': decodeURIComponent(xsrf),
  }

  const response = await page.request.post('/api/v1/cards/QA-1/comments', {
    headers,
    data: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ТК-3.36: без заголовка через API' }] }] } },
  })
  expect(response.status()).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'session_unverified' })

  // Вход, /auth/me и выход без заголовка работают как раньше (их заголовок не касается)
  expect((await page.request.get('/api/v1/auth/me', { headers })).status()).toBe(200)
  await context.close()
})
