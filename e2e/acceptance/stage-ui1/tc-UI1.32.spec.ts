import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import { CARD, copyFileLink, fileName, PNG, uploadFiles } from './file-links'

/**
 * ТК-UI1.32 (LATER-51): ссылка не открывает файл тому, кто не видит карточку, — страница Selen «Файл не найден или нет
 * доступа» с «На главную» (решение PM 22.10: вместо стандартной страницы 404), ни картинки, ни названия файла и
 * карточки. Анна → e2e-editor прикладывает картинку к WIN-17 «Чужая для подрядчика»; Жанна →
 * e2e-restricted («только свои карточки»: в этой карточке не заказчик, не ответственная, не участник) — во втором
 * браузерном контексте, как окно инкогнито с её входом.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.32. Без доступа к карточке — «не найдено» @tc-UI1.32', async ({
  page,
  browser,
}, testInfo) => {
  const name = fileName('картинка-ТК-UI1.32', 'png', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [{ name, mimeType: 'image/png', buffer: PNG }])
  const link = await copyFileLink(page, card, name)

  // 1. Жанна: вставить ссылку на файл — страница Selen «Файл не найден или нет доступа» и «На главную»
  const zhanna = await browser.newContext({ storageState: authFile('e2e-restricted@selen.test') })
  const tab = await zhanna.newPage()
  await tab.goto(link)
  await expect(tab).toHaveURL(/\/file-not-found$/)
  await expect(tab.getByRole('heading', { name: 'Файл не найден или нет доступа' })).toBeVisible()
  await expect(tab.getByRole('link', { name: 'На главную' })).toBeVisible()

  // Ни картинки, ни названия файла и карточки
  await expect(tab.locator('img[src^="/files/"]')).toHaveCount(0)
  const html = await tab.content()
  expect(html).not.toContain(name)
  expect(html).not.toContain(CARD)
  expect(html).not.toMatch(/WIN-\d+/)
  await zhanna.close()
})
