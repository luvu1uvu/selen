import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard } from './helpers'
import { CARD, DOWNLOAD_CSP, fileName, PNG, uploadFiles } from './file-links'

/**
 * ТК-UI1.34: «Скачать» всегда сохраняет файл, а не открывает его, — даже картинку. Анна → e2e-editor; карточка
 * с картинкой → WIN-17 «Чужая для подрядчика» (картинку тест прикладывает сам).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.34. «Скачать» скачивает даже картинку @tc-UI1.34', async ({ page }, testInfo) => {
  const name = fileName('картинка-ТК-UI1.34', 'png', testInfo)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [{ name, mimeType: 'image/png', buffer: PNG }])
  const cardUrl = page.url()

  // 1. У картинки в «Файлах» — «Скачать …»: файл сохраняется, вкладка с картинкой не открывается
  const files = card.getByRole('region', { name: 'Файлы' })
  const button = files.getByRole('link', { name: `Скачать ${name}`, exact: true })
  const download = page.waitForEvent('download')
  await button.click()
  expect((await download).suggestedFilename()).toBe(name)
  expect(page.context().pages()).toHaveLength(1)
  expect(page.url()).toBe(cardUrl)
  await expect(card).toBeVisible()

  // Сервер отдаёт картинку по «Скачать» вложением
  const response = await page.request.get((await button.getAttribute('href'))!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-disposition']).toMatch(/^attachment;/)
  expect(response.headers()['content-security-policy']).toBe(DOWNLOAD_CSP)
})
