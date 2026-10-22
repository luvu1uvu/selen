import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Ссылка на файл, открытая напрямую (UI-1b, LATER-51): /files/{id} — веб-маршрут на сессии. Вошедший с доступом
 * в новой вкладке получает файл; без входа — страница входа и возврат к файлу после входа. Вход — не формой (лимит
 * входа, CLAUDE.md, ловушки E2E): cookie сессии из storageState того же пользователя, затем страница входа сама
 * отправляет к файлу. Файл — картинка, приложенная к QA-4 «Устаревшая задача» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('ссылка на файл в новой вкладке: вошедший — файл; без входа — вход и возврат к файлу', async ({
  page,
  browser,
}, testInfo) => {
  const name = `ссылка${testInfo.retry ? `-${testInfo.retry}` : ''}.png`
  await page.goto('/cards/QA-2')
  const window = page.getByRole('dialog')
  await window.getByLabel('Выбрать файлы').setInputFiles([{ name, mimeType: 'image/png', buffer: PNG }])
  const preview = window.getByRole('img', { name, exact: true })
  await expect(preview).toBeVisible()
  const link = (await preview.getAttribute('src'))!
  expect(link).toMatch(/^\/files\/[0-9a-z]{26}$/)

  // «Скопировать ссылку на файл» (буфер обмена стенду E2E недоступен — адрес не localhost; содержимое — в Vitest)
  await window.getByRole('button', { name: `Скопировать ссылку на ${name}` }).click()
  await expect(page.getByText('Ссылка на файл скопирована')).toBeVisible()

  // 1. Вошедший: ссылка в новой вкладке (без Referer и заголовков SPA) — картинка в браузере
  const tab = await page.context().newPage()
  const response = (await tab.goto(link))!
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['content-disposition']).toMatch(/^inline;/)
  expect(tab.url()).toMatch(new RegExp(`${link}$`))
  // API с той же сессией, но без признаков SPA — по-прежнему 401
  expect((await tab.request.get(link.replace('/files/', '/api/v1/attachments/'))).status()).toBe(401)
  await tab.close()

  // 2. Без входа: страница входа, в адресе — файл для возврата
  // Явно пустое состояние: иначе новый контекст берёт storageState из test.use
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const guestPage = await guest.newPage()
  await guestPage.goto(link)
  await expect(guestPage).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(link)}$`))
  await expect(guestPage.getByRole('button', { name: 'Войти' })).toBeVisible()

  // Вошёл (cookie сессии того же пользователя) — страница входа отправляет к файлу
  const state = JSON.parse(readFileSync(authFile('e2e-editor@selen.test'), 'utf8')) as {
    cookies: Parameters<typeof guest.addCookies>[0]
  }
  await guest.addCookies(state.cookies)
  await guestPage.reload()
  await expect(guestPage).toHaveURL(new RegExp(`${link}$`))
  await guest.close()
})
