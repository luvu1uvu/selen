import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import {
  CARD,
  copyFileLink,
  fileName,
  guestContext,
  loginUrlFor,
  MESSENGER,
  PNG,
  signInWithCookies,
  uploadFiles,
} from './file-links'

/**
 * ТК-UI1.31 (LATER-51): коллега без входа по ссылке на файл попадает на вход, после входа — сразу к файлу, а «Назад»
 * уводит туда, откуда открыли ссылку, — не на вход и не снова к файлу. Ссылка — из ТК-UI1.30 (Анна → e2e-editor,
 * картинка в WIN-17 «Чужая для подрядчика»); инкогнито — новый контекст без входа, первая страница вкладки —
 * «мессенджер»; вход — cookie сессии Анны (не формой — лимит входа), страница входа сама уводит к файлу.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.31. Без входа — вход и возврат к файлу @tc-UI1.31', async ({
  page,
  browser,
}, testInfo) => {
  const name = fileName('картинка-ТК-UI1.31', 'png', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [{ name, mimeType: 'image/png', buffer: PNG }])
  const link = await copyFileLink(page, card, name)

  // 1. Инкогнито: вставить ссылку на файл — страница входа Selen
  const guest = await guestContext(browser)
  const tab = await guest.newPage()
  await tab.goto(MESSENGER)
  await tab.goto(link)
  await expect(tab).toHaveURL(loginUrlFor(link))
  await expect(tab.getByRole('button', { name: 'Войти' })).toBeVisible()

  // 2. Войти как Анна — сразу тот же файл (картинка), а не главная
  await signInWithCookies(guest, 'e2e-editor@selen.test')
  const opened = tab.waitForResponse((response) => response.url() === link)
  await tab.reload()
  const response = await opened
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  await expect(tab).toHaveURL(link)
  await expect(tab.locator('img')).toBeVisible()

  // 3. «Назад» — туда, откуда открыли ссылку: не страница входа и не снова файл
  await tab.goBack()
  await expect(tab).toHaveURL(/^data:text\/html/)
  await expect(tab).toHaveTitle('Мессенджер')
  await guest.close()
})
