import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { authFile } from './helpers'

/**
 * 419 (CSRF) при сохранении (LATER-78): cookie XSRF-TOKEN по хосту общие для всех портов — ответ другого экземпляра
 * Selen на том же хосте (dev в фоновой вкладке, пока PM работает на стенде) подменяет токен. Фронтенд один раз обновляет
 * токен и повторяет запрос; если и повтор — 419, понятное сообщение, введённый текст остаётся. Карточка QA-3 (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

/** Открыть QA-3 и набрать комментарий, не отправляя. */
async function draftComment(page: Page, text: string) {
  await page.goto('/cards/QA-3')
  const panel = page.getByRole('dialog')
  const editor = panel.getByRole('textbox', { name: 'Новый комментарий' })
  await editor.click()
  await page.keyboard.type(text)
  return { panel, editor }
}

/** Подменить XSRF-TOKEN, как это делает ответ другого экземпляра Selen на том же хосте. */
async function spoilXsrfToken(page: Page, context: BrowserContext) {
  // Каждый ответ Laravel заново ставит cookie — ждём, пока запросы страницы закончатся
  await page.waitForLoadState('networkidle')
  const xsrf = (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!
  await context.addCookies([{ ...xsrf, value: 'token-from-another-selen' }])
}

/** Статусы ответов на отправку комментария. */
function commentStatuses(page: Page) {
  const statuses: number[] = []
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && /\/api\/v1\/cards\/QA-3\/comments$/.test(response.url()))
      statuses.push(response.status())
  })
  return statuses
}

test('чужой XSRF-TOKEN перед сохранением: токен обновляется, комментарий сохраняется', async ({ page, context }) => {
  const text = 'LATER-78: сохранён после чужого токена'
  const { panel, editor } = await draftComment(page, text)
  await spoilXsrfToken(page, context)
  const statuses = commentStatuses(page)

  await panel.getByRole('button', { name: 'Отправить' }).click()

  await expect(panel.getByRole('listitem').filter({ hasText: text })).toBeVisible()
  await expect(editor).not.toContainText(text)
  expect(statuses).toEqual([419, 201])
  await expect(page.getByText('Сессия устарела, обновите страницу')).toHaveCount(0)
})

test('и повтор — 419: «Сессия устарела, обновите страницу», текст не теряется', async ({ page, context }) => {
  const text = 'LATER-78: не сохранён, но не потерян'
  const { panel, editor } = await draftComment(page, text)
  await spoilXsrfToken(page, context)
  // Обновление токена «не помогло»: ответ без нового cookie
  await page.route('**/sanctum/csrf-cookie', (route) => route.fulfill({ status: 204 }))
  const statuses = commentStatuses(page)

  await panel.getByRole('button', { name: 'Отправить' }).click()

  await expect(page.getByText('Сессия устарела, обновите страницу')).toBeVisible()
  expect(statuses).toEqual([419, 419])
  await expect(editor).toContainText(text)
  await expect(panel.getByRole('listitem').filter({ hasText: text })).toHaveCount(0)
})
