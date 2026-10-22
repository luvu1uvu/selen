import { readFileSync } from 'node:fs'
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { authFile, type User } from '../../tests/helpers'
import { copiedText, PNG_BASE64 } from './helpers'

/**
 * Общие шаги приёмочных автотестов подэтапа UI-1b — ссылка на файл, открытая напрямую (docs/stages/ui-1.md, ТК-UI1.30–35,
 * LATER-51).
 *
 * Данные — E2eSeeder: карточка WIN-17 «Чужая для подрядчика» пространства WIN «Окно карточки» (доска «Окно»). Анна
 * тест-кейсов — e2e-editor (editor в WIN, правит карточку); Жанна — e2e-restricted («только свои карточки»): в этой
 * карточке она не заказчик, не ответственная и не участник, как в карточке демо-данных ТК-UI1.32. Файлов в E2eSeeder
 * нет — тест прикладывает их сам, с именем, своим для каждого тест-кейса и повтора CI.
 */

export const CARD = 'Чужая для подрядчика'

export const PNG = Buffer.from(PNG_BASE64, 'base64')

/** Настоящий PDF (сигнатура %PDF-): сервер определяет тип по содержимому при загрузке. */
export const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\n' +
    'endobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
)

/** «Документ Word»: zip-сигнатура и произвольные байты — браузер такое не показывает. */
export const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** CSP PDF в браузере — без sandbox (AttachmentFiles::PDF_CSP, ставит nginx). */
export const PDF_CSP =
  "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/** CSP всего, что скачивается: с sandbox. */
export const DOWNLOAD_CSP = "default-src 'none'; sandbox"

/** Имя файла тест-кейса: на повторе CI — другое (файл первого прогона уже в карточке). */
export const fileName = (base: string, ext: string, testInfo: TestInfo) =>
  `${base}${testInfo.retry ? `-${testInfo.retry}` : ''}.${ext}`

type UploadFile = { name: string; mimeType: string; buffer: Buffer }

/** «+» → «Загрузить файл» → выбрать файлы с компьютера (окно выбора файла Playwright); ждёт уведомления о каждом. */
export async function uploadFiles(page: Page, card: Locator, files: UploadFile[]) {
  await card.getByRole('button', { name: 'Добавить в карточку' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Загрузить файл' }).click()
  await (await chooser).setFiles(files)
  for (const file of files) {
    await expect(
      card.getByRole('button', { name: `Скопировать ссылку на ${file.name}`, exact: true }),
    ).toBeVisible()
  }
}

/**
 * Значок «Скопировать ссылку на …» у файла в «Файлах»: уведомление и полный адрес /files/{id} в буфере (буфер
 * обмена подменён — stubClipboard: стек E2E открыт не по localhost, настоящего буфера у браузера нет).
 */
export async function copyFileLink(page: Page, card: Locator, name: string) {
  await page.evaluate(() => {
    ;(window as unknown as { __copied?: string }).__copied = undefined
  })
  await card.getByRole('button', { name: `Скопировать ссылку на ${name}`, exact: true }).click()
  await expect(page.getByText('Ссылка на файл скопирована').last()).toBeVisible()
  await expect.poll(() => copiedText(page)).not.toBeNull()
  const link = (await copiedText(page))!
  expect(link).toMatch(/^https?:\/\/[^/]+\/files\/[0-9a-z]{26}$/)
  return link
}

/** Окно инкогнито: новый контекст без входа (явно пустой — иначе берётся storageState из test.use). */
export const guestContext = (browser: Browser) =>
  browser.newContext({ storageState: { cookies: [], origins: [] } })

/**
 * Вход во вкладке гостя — не формой (лимит входа, CLAUDE.md, ловушки E2E): cookie сессии пользователя из его
 * storageState. Затем страница входа перезагружается и сама уводит к файлу — тот же переход (RequireGuest), что
 * после входа формой.
 */
export async function signInWithCookies(context: BrowserContext, user: User) {
  const state = JSON.parse(readFileSync(authFile(user), 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0]
  }
  await context.addCookies(state.cookies)
}

/** Страница, откуда открыли ссылку (мессенджер): первая запись истории вкладки — для проверки «Назад». */
export const MESSENGER = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<title>Мессенджер</title><p>Ссылка от коллеги</p>',
)}`

/** Адрес входа с возвратом к файлу: /login?next=/files/{id}. */
export const loginUrlFor = (link: string) =>
  new RegExp(`/login\\?next=${encodeURIComponent(new URL(link).pathname)}$`)
