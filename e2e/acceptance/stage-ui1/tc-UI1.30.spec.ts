import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import { CARD, copyFileLink, fileName, PNG, uploadFiles } from './file-links'

/**
 * ТК-UI1.30 (LATER-51): ссылку на файл можно открыть напрямую — в новой вкладке картинка, а не
 * {"message":"Unauthenticated."}. Анна → e2e-editor; карточка с картинкой в «Файлах» → WIN-17 «Чужая для подрядчика»
 * (картинку тест прикладывает сам — в E2eSeeder файлов нет).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.30. Ссылка на файл открывается в новой вкладке @tc-UI1.30', async ({
  page,
}, testInfo) => {
  const name = fileName('картинка-ТК-UI1.30', 'png', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [{ name, mimeType: 'image/png', buffer: PNG }])

  // 1–2. У картинки — «Скопировать ссылку на …»: уведомление «Ссылка на файл скопирована», адрес …/files/…
  const link = await copyFileLink(page, card, name)

  // 3. Новая вкладка, ссылка, Enter — картинка; адрес …/files/…; никакого «Unauthenticated»
  const tab = await page.context().newPage()
  const response = (await tab.goto(link))!
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  await expect(tab).toHaveURL(link)
  const image = tab.locator('img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1)
  await expect(tab.getByText('Unauthenticated')).toHaveCount(0)
})
