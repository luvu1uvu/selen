import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import { CARD, DOCX, DOCX_TYPE, fileName, PDF, uploadFiles } from './file-links'

/**
 * ТК-UI1.36 (решение PM 22.10): имя файла, который браузер показывает сам (PDF по содержимому, картинка, видео), открывает
 * его в новой вкладке; имя остальных — скачивает; «Скачать» — отдельной кнопкой. Анна → e2e-editor, карточка WIN-17
 * «Чужая для подрядчика».
 *
 * Вид PDF во вкладке скриптом не проверить (у Chromium без окна просмотрщика нет): проверяется, что щелчок открыл новую
 * вкладку и она получила PDF для показа (application/pdf, «inline»), а окно карточки осталось на месте.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.36. Имя PDF открывает его в новой вкладке, имя документа — скачивает @tc-UI1.36', async ({
  page,
}, testInfo) => {
  const pdfName = fileName('договор-ТК-UI1.36', 'pdf', testInfo)
  const docxName = fileName('отчёт-ТК-UI1.36', 'docx', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [
    { name: pdfName, mimeType: 'application/pdf', buffer: PDF },
    { name: docxName, mimeType: DOCX_TYPE, buffer: DOCX },
  ])
  const address = page.url()

  // 1. Щёлкнуть имя PDF — новая вкладка с PDF для показа; окно карточки на месте
  const popup = page.waitForEvent('popup')
  const opened = page
    .context()
    .waitForEvent(
      'response',
      (response) =>
        /^\/files\/[0-9a-z]{26}$/.test(new URL(response.url()).pathname) &&
        response.request().isNavigationRequest(),
    )
  await card.getByRole('link', { name: pdfName, exact: true }).click()
  const tab = await popup
  const response = await opened
  expect(response.headers()['content-type']).toBe('application/pdf')
  expect(response.headers()['content-disposition']).toMatch(/^inline;/)
  await expect(card).toBeVisible()
  expect(page.url()).toBe(address)
  await tab.close()

  // 2. Щёлкнуть имя документа Word — скачивание, новая вкладка не открывается
  let popups = 0
  page.on('popup', () => popups++)
  const download = page.waitForEvent('download')
  await card.getByRole('link', { name: docxName, exact: true }).click()
  expect((await download).suggestedFilename()).toBe(docxName)
  expect(popups).toBe(0)
  await expect(card).toBeVisible()
})
