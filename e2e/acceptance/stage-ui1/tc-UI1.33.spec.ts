import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import {
  CARD,
  copyFileLink,
  DOCX,
  DOCX_TYPE,
  DOWNLOAD_CSP,
  fileName,
  PDF,
  PDF_CSP,
  uploadFiles,
} from './file-links'

/**
 * ТК-UI1.33 (решение PM, вариант А): PDF по ссылке открывается в браузере, документ Word — скачивается, «Скачать» у PDF —
 * скачивает. Анна → e2e-editor, карточка WIN-17 «Чужая для подрядчика»; PDF и документ — с компьютера через «+» →
 * «Загрузить файл» (окно выбора файла Playwright).
 *
 * Сам встроенный просмотрщик PDF скриптом не проверить (браузер E2E без интерфейса, у Chromium без окна просмотрщика
 * нет — он бы скачал PDF): шаг 2 проверяется ответом сервера по ссылке — тип application/pdf, «inline», CSP без sandbox
 * (с ней Chrome PDF не показывает). Вид PDF во вкладке — только вручную (PM).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.33. PDF открывается в браузере, другие документы скачиваются @tc-UI1.33', async ({
  page,
}, testInfo) => {
  const pdfName = fileName('договор-ТК-UI1.33', 'pdf', testInfo)
  const docxName = fileName('отчёт-ТК-UI1.33', 'docx', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)

  // 1. «+» → «Загрузить файл» → PDF; затем так же — документ Word
  await uploadFiles(page, card, [{ name: pdfName, mimeType: 'application/pdf', buffer: PDF }])
  await uploadFiles(page, card, [{ name: docxName, mimeType: DOCX_TYPE, buffer: DOCX }])

  // 2. У PDF — «Скопировать ссылку на …», ссылка в новой вкладке: браузер получает PDF для показа, а не для скачивания
  const pdfLink = await copyFileLink(page, card, pdfName)
  const pdf = await page.request.get(pdfLink)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect(pdf.headers()['content-disposition']).toMatch(/^inline;/)
  expect(pdf.headers()['content-security-policy']).toBe(PDF_CSP)
  expect((await pdf.body()).equals(PDF)).toBe(true)

  // 3. То же с документом Word — скачивается, вкладка его не показывает
  const docxLink = await copyFileLink(page, card, docxName)
  const tab = await page.context().newPage()
  const docxDownload = tab.waitForEvent('download')
  await expect(tab.goto(docxLink)).rejects.toThrow(/Download is starting/)
  expect((await docxDownload).suggestedFilename()).toBe(docxName)
  expect(tab.url()).not.toContain('/files/')
  const docx = await page.request.get(docxLink)
  expect(docx.headers()['content-disposition']).toMatch(/^attachment;/)
  expect(docx.headers()['content-security-policy']).toBe(DOWNLOAD_CSP)
  await tab.close()

  // 4. У PDF — «Скачать …»: PDF скачивается, окно карточки остаётся на месте
  const cardUrl = page.url()
  const pdfDownload = page.waitForEvent('download')
  await card.getByRole('link', { name: `Скачать ${pdfName}`, exact: true }).click()
  expect((await pdfDownload).suggestedFilename()).toBe(pdfName)
  expect(page.url()).toBe(cardUrl)
  await expect(card).toBeVisible()
  expect(page.context().pages()).toHaveLength(1)
})
