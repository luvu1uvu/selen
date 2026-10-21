import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'

/**
 * ТК-L78.1 (LATER-78): значение cookie XSRF-TOKEN заменили (как это делает другой экземпляр Selen на том же хосте) —
 * комментарий всё равно сохраняется: клиент один раз обновляет токен и повторяет запрос; поле очищается, ошибок нет.
 * «Любая карточка «Продукта»» → MOB-1 (E2eSeeder; e2e-editor — комментатор, комментировать может).
 *
 * Руками на dev (http://localhost) отказ 419 не воспроизводится: Laravel 13 пропускает запрос того же источника по
 * заголовку Sec-Fetch-Site, а браузер шлёт его только «надёжным» адресам (localhost, https). E2E ходит на http://nginx —
 * заголовка нет, токен проверяется, и путь «419 → новый токен → повтор» здесь настоящий.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-L78.1. Сохранение проходит после чужого CSRF-токена @tc-L78.1', async ({ page, context }) => {
  const text = 'ТК-L78.1: проверка токена'

  // 1. Открыть карточку, набрать комментарий, не отправлять
  await page.goto('/cards/MOB-1')
  const panel = page.getByRole('dialog')
  const editor = panel.getByRole('textbox', { name: 'Новый комментарий' })
  await editor.click()
  await page.keyboard.type(text)

  // 2. Значение XSRF-TOKEN — «abc» (каждый ответ Laravel заново ставит cookie — ждём, пока запросы страницы закончатся)
  await page.waitForLoadState('networkidle')
  const xsrf = (await context.cookies()).find((cookie) => cookie.name === 'XSRF-TOKEN')!
  await context.addCookies([{ ...xsrf, value: 'abc' }])
  expect(await page.evaluate(() => document.cookie.split('; ').filter((c) => c.startsWith('XSRF-TOKEN=')))).toEqual([
    'XSRF-TOKEN=abc',
  ])
  const statuses: number[] = []
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && /\/api\/v1\/cards\/MOB-1\/comments$/.test(response.url()))
      statuses.push(response.status())
  })

  // 3. «Отправить»
  await panel.getByRole('button', { name: 'Отправить' }).click()

  // Комментарий — в ленте, поле очистилось, сообщений об ошибке нет
  await expect(panel.getByRole('listitem').filter({ hasText: text })).toBeVisible()
  await expect(editor).not.toContainText(text)
  await expect(page.getByText('Сессия устарела, обновите страницу')).toHaveCount(0)
  await expect(page.getByText('CSRF token mismatch')).toHaveCount(0)
  // Первый ответ — отказ по токену, повтор с обновлённым токеном — сохранено
  expect(statuses).toEqual([419, 201])
})
