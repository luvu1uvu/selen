import { expect, test, type Locator } from '@playwright/test'
import { expectDarkScreen } from '../../dark/helpers'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { DARK, contrast, luminance, rgbOf, styleOf } from './helpers'

/**
 * ТК-RD2.5. Тёмная тема: доска и окно карточки — без светлых пятен, уровни тоном (холст → доска → карточка светлее),
 * текст читается (axe-core color-contrast), главная кнопка «+» — светлая с тёмным плюсом. Анна с «Тёмной» → e2e-dark
 * (сохранена «Тёмная»; система — светлая, выбор пользователя главнее), «Продукт» → DARK «Тёмная проверка» / «Вид».
 * DEV-173 демо-данных (блокировка, чек-лист, файл, комментарии, срок) → DARK-4 «Полная карточка» (чек-лист, файл с
 * картинкой, комментарий, срок) и DARK-1 «Заблокированная» (плашка блокировки). Только смотрим, данные не меняем.
 * Вручную: нативный календарь поля даты (его рисует браузер, в DOM его нет — проверяем, что поле в тёмной схеме:
 * color-scheme: dark), «текст на метках читается» глазом.
 */
test.use({ storageState: authFile(DARK.user) })

/** Прокрутить окно карточки до конца. */
async function scrollToEnd(dialog: Locator) {
  await dialog.evaluate((root) => {
    for (const e of [root, ...root.querySelectorAll('*')]) {
      if (e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight
    }
  })
}

test('ТК-RD2.5. Тёмная тема: доска и окно карточки @tc-RD2.5', async ({ page }) => {
  // 1. Доска: холст почти чёрный, доска светлее, карточки ещё светлее; рамки тонкие; светлых пятен нет, текст читается
  await openHome(page)
  await openSpaceBoard(page, DARK.space, DARK.board)
  const board = page.getByRole('region', { name: DARK.board })
  await expect(board.locator('[data-card-tile]')).toHaveCount(6)
  await expect(board.getByText('Заблокирована', { exact: true })).toBeVisible()
  await expect(board.getByText('Срочно', { exact: true })).toBeVisible()
  await expectDarkScreen(page, 'доска')

  const canvas = await rgbOf(page, (await styleOf(page.locator('[data-board-canvas]'))).background)
  const boardStyle = await styleOf(board)
  const face = board.getByRole('button', { name: /^Открыть DARK-\d+: Срочная$/ }).locator(':scope > div')
  const faceStyle = await styleOf(face)
  const [boardColor, cardColor] = [await rgbOf(page, boardStyle.background), await rgbOf(page, faceStyle.background)]
  expect(luminance(canvas), 'холст почти чёрный').toBeLessThan(0.01)
  expect(luminance(boardColor), 'доска светлее холста').toBeGreaterThan(luminance(canvas))
  expect(luminance(cardColor), 'карточка светлее доски').toBeGreaterThan(luminance(boardColor))
  expect(boardStyle.borderWidth, 'тонкая рамка доски').toBe('1px')
  expect(faceStyle.borderWidth, 'тонкая рамка карточки').toBe('1px')

  // 2. Окно DARK-4: тёмное с тонкой рамкой, доска под ним затемнена; чек-лист, файл, комментарий — без светлых пятен
  await board.getByRole('button', { name: /^Открыть DARK-\d+: Полная карточка$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Полная карточка' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Перед релизом')).toBeVisible()
  await expect(dialog.getByText('скриншот-тёмной.png').first()).toBeVisible()
  await expect(dialog.getByText('Комментарий в тёмной теме')).toBeVisible()
  const dialogStyle = await styleOf(dialog)
  expect(luminance(await rgbOf(page, dialogStyle.background)), 'окно тёмное').toBeLessThan(0.02)
  expect(dialogStyle.borderWidth, 'тонкая рамка окна').toBe('1px')
  const shade = await page.evaluate(() => getComputedStyle(document.elementFromPoint(4, window.innerHeight - 4)!).backgroundColor)
  const shadeColor = await rgbOf(page, shade)
  expect(shadeColor.a, 'доска под окном затемнена').toBeGreaterThanOrEqual(0.5)
  expect(luminance(shadeColor), 'затемнение — чёрное').toBeLessThan(0.001)
  await expectDarkScreen(page, 'окно карточки, верх')

  // Кнопка «+» — светло-сиреневая с тёмным плюсом
  const plus = await styleOf(dialog.getByRole('button', { name: 'Добавить в карточку' }))
  const [plusBackground, plusGlyph] = [await rgbOf(page, plus.background), await rgbOf(page, plus.color)]
  expect(plus.background, '«+» — светлый акцент #8b8cf8').toBe('rgb(139, 140, 248)')
  expect(luminance(plusBackground), 'кнопка светлее плюса').toBeGreaterThan(luminance(plusGlyph))
  expect(contrast(plusBackground, plusGlyph)).toBeGreaterThanOrEqual(4.5)

  // Прокрутить окно до конца — светлых пятен нет и там
  await scrollToEnd(dialog)
  await expectDarkScreen(page, 'окно карточки, низ')

  // 3. Срок в «Основных параметрах» → поле даты: тёмное, в тёмной схеме (календарь и значок браузера — тёмные); Esc
  await dialog.evaluate((root) => root.querySelectorAll('*').forEach((e) => e.scrollTop && (e.scrollTop = 0)))
  await dialog.getByRole('button', { name: /^Срок: / }).click()
  const date = page.getByLabel('Дата срока', { exact: true })
  await expect(date).toBeVisible()
  expect((await styleOf(date)).colorScheme, 'поле даты — в тёмной схеме').toBe('dark')
  await expectDarkScreen(page, 'поле даты')
  await page.keyboard.press('Escape')
  await expect(date).toBeHidden()
  await expect(dialog, 'Esc закрыл только поле даты').toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  // Плашка блокировки в окне — DARK-1
  await board.getByRole('button', { name: /^Открыть DARK-\d+: Заблокированная$/ }).click()
  const blocked = page.getByRole('dialog', { name: 'Заблокированная' })
  await expect(blocked.getByText('Ждём доступ к стенду')).toBeVisible()
  await expectDarkScreen(page, 'окно заблокированной карточки')
})
