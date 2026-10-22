import { expect, test, type Page } from '@playwright/test'
import { authFile, pageAs } from './helpers'

/** Минимальный PNG 1×1. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Начало файла QuickTime — запись экрана macOS (.mov); сервер определяет тип по содержимому. */
const MOV = Buffer.from('000000146674797071742020000000007174202000000008667265650000000000', 'hex')

/** Запрос из страницы (cookie-сессия Sanctum): статус, нужные заголовки и длина тела. */
async function fetchFile(page: Page, url: string, headers: Record<string, string> = {}) {
  return page.evaluate(
    async ({ url, headers }) => {
      const response = await fetch(url, { headers })
      const body = await response.arrayBuffer()
      const pick = ['content-type', 'content-disposition', 'content-range', 'x-content-type-options', 'content-security-policy']
      return {
        status: response.status,
        headers: Object.fromEntries(pick.map((h) => [h, response.headers.get(h)])),
        length: body.byteLength,
      }
    },
    { url, headers },
  )
}

test.use({ storageState: authFile('e2e-editor@selen.test') })

test('вложения: загрузка, превью, скачивание через nginx с Range; SVG — только скачиванием; чужим — 404', async ({ page, browser }, testInfo) => {
  // Повторная попытка (retry) идёт на той же базе — имена файлов не должны совпасть с первой
  const suffix = testInfo.retry ? `-${testInfo.retry}` : ''
  const imageName = `скриншот${suffix}.png`
  const svgName = `logo${suffix}.svg`
  const movName = `запись${suffix}.mov`
  await page.goto('/cards/QA-1')
  const panel = page.getByRole('dialog')
  const files = panel.getByRole('region', { name: 'Файлы' })

  // Окно карточки (UI-1a): файлы выбирает окно (пункт «+», перетаскивание), секция «Файлы» появляется с первым файлом
  await panel.getByLabel('Выбрать файлы').setInputFiles([
    { name: imageName, mimeType: 'image/png', buffer: PNG },
    { name: svgName, mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') },
    { name: movName, mimeType: 'video/quicktime', buffer: MOV },
  ])

  // Картинка — превью, SVG — обычный файл для скачивания
  const preview = files.getByRole('img', { name: imageName, exact: true })
  await expect(preview).toBeVisible()
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  const svgLink = files.getByRole('link', { name: svgName, exact: true })
  await expect(svgLink).toBeVisible()

  const imageUrl = (await preview.getAttribute('src'))!
  const inline = await fetchFile(page, imageUrl)
  expect(inline.status).toBe(200)
  expect(inline.headers['content-type']).toBe('image/png')
  expect(inline.headers['content-disposition']).toMatch(/^inline;/)
  expect(inline.headers['x-content-type-options']).toBe('nosniff')
  expect(inline.length).toBe(PNG.length)

  // Range — отдаёт nginx (перемотка видео работает так же)
  const part = await fetchFile(page, imageUrl, { Range: 'bytes=0-9' })
  expect(part.status).toBe(206)
  expect(part.headers['content-range']).toBe(`bytes 0-9/${PNG.length}`)
  expect(part.length).toBe(10)

  const svgUrl = (await svgLink.getAttribute('href'))!
  const svg = await fetchFile(page, `${svgUrl}?inline=1`)
  expect(svg.status).toBe(200)
  expect(svg.headers['content-type']).toBe('application/octet-stream')
  expect(svg.headers['content-disposition']).toMatch(/^attachment;/)
  expect(svg.headers['content-security-policy']).toContain('sandbox')

  // Видео с Mac: заглушка-файл в Chromium не воспроизводится — вместо плеера сообщение и «Скачать»;
  // сам файл отдаётся inline как video/quicktime (настоящую запись экрана браузер покажет в плеере)
  await expect(files.getByRole('status')).toContainText('Браузер не может воспроизвести это видео')
  const movUrl = (await files.getByRole('link', { name: 'Скачать', exact: true }).getAttribute('href'))!
  const movInline = await fetchFile(page, `${movUrl}?inline=1`)
  expect(movInline.status).toBe(200)
  expect(movInline.headers['content-type']).toBe('video/quicktime')
  expect(movInline.headers['content-disposition']).toMatch(/^inline;/)
  expect(movInline.length).toBe(MOV.length)

  // Скачивание из интерфейса
  const download = page.waitForEvent('download')
  await svgLink.click()
  expect((await download).suggestedFilename()).toBe(svgName)

  // Internal-location nginx снаружи недоступен
  expect((await fetchFile(page, '/_protected/attachments/x')).status).toBe(404)

  // Посторонний — 404 и на файл, и на карточку
  const outsider = await pageAs(browser, 'e2e-outsider@selen.test')
  expect((await fetchFile(outsider, imageUrl)).status).toBe(404)
  await outsider.context().close()
})
