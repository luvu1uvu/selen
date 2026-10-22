import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { copiedText, stubClipboard } from '../acceptance/stage-ui1/helpers'
import { authFile } from './helpers'

/**
 * Ссылка на файл, открытая напрямую (UI-1b, LATER-51): /files/{id} — веб-маршрут на сессии. Вошедший с доступом
 * в новой вкладке получает файл; без входа — страница входа и возврат к файлу после входа. Вход — не формой (лимит
 * входа, CLAUDE.md, ловушки E2E): cookie сессии из storageState того же пользователя, затем страница входа сама
 * отправляет к файлу. Файлы тест прикладывает сам к QA-2.
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
  await stubClipboard(page)
  await page.goto('/cards/QA-2')
  const window = page.getByRole('dialog')
  await window.getByLabel('Выбрать файлы').setInputFiles([{ name, mimeType: 'image/png', buffer: PNG }])
  const preview = window.getByRole('img', { name, exact: true })
  await expect(preview).toBeVisible()
  const link = (await preview.getAttribute('src'))!
  expect(link).toMatch(/^\/files\/[0-9a-z]{26}$/)

  // «Скопировать ссылку на файл» — полный адрес (буфер обмена стеку E2E недоступен — адрес не localhost; подменён)
  await window.getByRole('button', { name: `Скопировать ссылку на ${name}` }).click()
  await expect(page.getByText('Ссылка на файл скопирована')).toBeVisible()
  expect(await copiedText(page)).toBe(new URL(link, page.url()).href)

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

/** Настоящий PDF (сигнатура %PDF-) — сервер определяет тип по содержимому при загрузке. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
    'trailer\n<< /Root 1 0 R >>\n%%EOF\n',
)

/** CSP PDF в браузере — AttachmentFiles::PDF_CSP; nginx ставит её сам (заголовки Laravel после X-Accel не доходят). */
const PDF_CSP =
  "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

test('PDF по содержимому — в браузере с CSP без sandbox (заголовки ставит nginx); «.pdf» с HTML — скачиванием', async ({
  page,
}, testInfo) => {
  const suffix = testInfo.retry ? `-${testInfo.retry}` : ''
  const pdfName = `договор${suffix}.pdf`
  const fakeName = `отчёт${suffix}.pdf`
  await page.goto('/cards/QA-2')
  const window = page.getByRole('dialog')
  await window.getByLabel('Выбрать файлы').setInputFiles([
    { name: pdfName, mimeType: 'application/pdf', buffer: PDF },
    { name: fakeName, mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') },
  ])
  const files = window.getByRole('region', { name: 'Файлы' })
  const href = async (name: string) => (await files.getByRole('link', { name, exact: true }).getAttribute('href'))!

  // Запрос с cookie сессии, без признаков SPA — как переход браузера по ссылке
  const pdfLink = await href(pdfName)
  const pdf = await page.request.get(pdfLink)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect(pdf.headers()['content-disposition']).toMatch(/^inline;/)
  expect(pdf.headers()['content-security-policy']).toBe(PDF_CSP)
  expect(pdf.headers()['x-content-type-options']).toBe('nosniff')
  expect(pdf.headers()['cache-control']).toContain('no-cache')
  expect((await pdf.body()).length).toBe(PDF.length)
  // Повторное открытие: сервер снова проверяет права, неизменённый файл — 304 без тела
  const etag = pdf.headers()['etag']
  expect(etag).toBeTruthy()
  expect((await page.request.get(pdfLink, { headers: { 'If-None-Match': etag } })).status()).toBe(304)
  // «Скачать» — скачиванием и с sandbox, как остальные файлы
  const download = await page.request.get(`${pdfLink}?download=1`)
  expect(download.headers()['content-disposition']).toMatch(/^attachment;/)
  expect(download.headers()['content-security-policy']).toBe("default-src 'none'; sandbox")

  const fake = await page.request.get(await href(fakeName))
  expect(fake.status()).toBe(200)
  expect(fake.headers()['content-type']).toBe('application/octet-stream')
  expect(fake.headers()['content-disposition']).toMatch(/^attachment;/)
  expect(fake.headers()['content-security-policy']).toBe("default-src 'none'; sandbox")

  // Internal-location для PDF снаружи недоступен
  expect((await page.request.get('/_protected/attachments-pdf/x')).status()).toBe(404)
})
