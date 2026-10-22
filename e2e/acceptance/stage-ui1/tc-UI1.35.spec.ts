import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, stubClipboard } from './helpers'
import {
  CARD,
  copyFileLink,
  DOCX,
  DOCX_TYPE,
  fileName,
  guestContext,
  loginUrlFor,
  signInWithCookies,
  uploadFiles,
} from './file-links'

/**
 * ТК-UI1.35 (находка В-1 ревью UI-1b): без входа по ссылке на документ — после входа документ скачивается, а вкладка
 * не «висит» на «Загрузке…»: «Открываем файл…», подсказка и «На главную». Анна → e2e-editor, документ Word в WIN-17
 * «Чужая для подрядчика» (ТК-UI1.33); инкогнито — новый контекст без входа; вход — cookie сессии Анны (не формой —
 * лимит входа), страница входа сама уводит к файлу — тот же переход, что после входа формой.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.35. Без входа по ссылке на документ — скачивание и понятная вкладка @tc-UI1.35', async ({
  page,
  browser,
}, testInfo) => {
  const name = fileName('отчёт-ТК-UI1.35', 'docx', testInfo)
  await stubClipboard(page)
  const card = await openCard(page, CARD)
  await uploadFiles(page, card, [{ name, mimeType: DOCX_TYPE, buffer: DOCX }])
  const link = await copyFileLink(page, card, name)

  // 1. Инкогнито: вставить ссылку на документ — страница входа
  const guest = await guestContext(browser)
  const tab = await guest.newPage()
  await tab.goto(link)
  await expect(tab).toHaveURL(loginUrlFor(link))
  await expect(tab.getByRole('button', { name: 'Войти' })).toBeVisible()

  // 2. Войти как Анна — документ скачивается; во вкладке «Открываем файл…», подсказка и «На главную», без «Загрузки…»
  await signInWithCookies(guest, 'e2e-editor@selen.test')
  const download = tab.waitForEvent('download')
  await tab.reload()
  expect((await download).suggestedFilename()).toBe(name)
  await expect(tab.getByText('Открываем файл…')).toBeVisible()
  await expect(tab.getByText('Если файл скачался, эту вкладку можно закрыть.')).toBeVisible()
  const home = tab.getByRole('link', { name: 'На главную' })
  await expect(home).toBeVisible()
  await expect(tab.getByText('Загрузка…')).toHaveCount(0)

  // 3. «На главную» — главная Selen («Пространства»)
  await home.click()
  await expect(tab.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  await guest.close()
})
