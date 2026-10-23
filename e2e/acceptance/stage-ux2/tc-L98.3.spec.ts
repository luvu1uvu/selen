import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { PNG_BASE64 } from '../stage-ui1/helpers'
import { expectHint, isTruncated } from '../stage-ux1/helpers'
import { DESKTOP, moveMouseOffWindow, openCardByKey, WINDOW_CARD } from './helpers'

/**
 * ТК-L98.3 (UX-ревью UI-1b): подписи значков файла — с именем в «ёлочках»; длинное имя под превью обрезано «…»,
 * полностью — в подсказке. Анна → e2e-editor, DEV-41 → UXB-1 «Как DEV-41» с картинкой «скриншот-41.png»
 * (E2eSeeder::uxBatch2); файл с длинным именем — PNG, выбранный в окне выбора файла (Playwright); на повторе CI имя
 * другое (файл первого прогона уже в карточке).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

const IMAGE = 'скриншот-41.png'

test('ТК-L98.3. Значки файла: имя в «ёлочках», полное имя в подсказке @tc-L98.3', async ({ page }, testInfo) => {
  // 1. Секция «Файлы» — картинка «скриншот-41.png»
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)
  const files = window.getByRole('region', { name: 'Файлы' })
  await expect(files.getByRole('img', { name: IMAGE, exact: true })).toBeVisible()

  // 2. Значки «скопировать ссылку» и «скачать» под картинкой — подсказки с именем в «ёлочках»
  const copy = files.getByRole('button', { name: `Скопировать ссылку на «${IMAGE}»`, exact: true })
  await copy.scrollIntoViewIfNeeded()
  await copy.hover()
  await expectHint(page, `Скопировать ссылку на «${IMAGE}»`)
  await moveMouseOffWindow(page)
  await files.getByRole('link', { name: `Скачать «${IMAGE}»`, exact: true }).hover()
  await expectHint(page, `Скачать «${IMAGE}»`)
  await moveMouseOffWindow(page)

  // 3. Приложить файл с длинным именем — имя под превью обрезано «…», в подсказке полностью
  const long = `очень-длинное-имя-файла-для-проверки-подсказки${testInfo.retry ? `-${testInfo.retry}` : ''}.png`
  const chooser = page.waitForEvent('filechooser')
  await files.getByRole('button', { name: 'Приложить файл' }).click()
  await (await chooser).setFiles({ name: long, mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })
  const name = files.getByRole('link', { name: long, exact: true })
  await expect(name).toBeVisible()
  await expect(name).toHaveText(long)
  expect(await isTruncated(name), 'имя под превью обрезано').toBe(true)
  expect(await name.evaluate((e) => getComputedStyle(e).textOverflow)).toBe('ellipsis')
  await name.scrollIntoViewIfNeeded()
  await name.hover()
  await expectHint(page, long)
})
