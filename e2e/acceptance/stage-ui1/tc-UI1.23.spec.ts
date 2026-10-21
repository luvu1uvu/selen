import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openWinBoard, tile } from './helpers'

/**
 * ТК-UI1.23 (решение PM 1): несохранённый текст не теряется молча — первый Esc выводит из поля (текст на месте),
 * следующее закрытие (Esc, щелчок мимо окна, «Назад») спрашивает «Закрыть без сохранения?»; «Продолжить
 * редактирование» — окно и текст на месте, «Закрыть без сохранения» — окно закрыто, доска на прежнем месте. Без текста
 * окно закрывается сразу. Доска «Продукт» → «Окно» пространства WIN, карточка WIN-18 «Просто карточка» (E2eSeeder);
 * Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const canvasScroll = (page: Page) =>
  page.locator('[data-board-canvas]').evaluate((canvas) => canvas.scrollTop)

test('ТК-UI1.23. Несохранённый текст не теряется молча @tc-UI1.23', async ({ page }) => {
  await openWinBoard(page)
  const boardUrl = page.url()
  const window = page.getByRole('dialog', { name: 'Просто карточка' })
  const comment = window.getByRole('textbox', { name: 'Новый комментарий' })
  const confirm = page.getByRole('dialog', { name: 'Закрыть без сохранения?' })

  // 1. Открыть карточку, начать писать комментарий «Черновик»
  await tile(page, 'Просто карточка').click()
  await expect(window).toBeVisible()
  // Место доски под окном (щелчок по карточке ниже края экрана прокрутил к ней холст — так и до окна)
  const scroll = await canvasScroll(page)
  await comment.click()
  await page.keyboard.type('Черновик')

  // 2. Esc: окно не закрылось, курсор вышел из поля, текст на месте
  await page.keyboard.press('Escape')
  await expect(comment).not.toBeFocused()
  await expect(window).toBeVisible()
  await expect(comment).toHaveText('Черновик')

  // 3–4. Esc ещё раз — вопрос; «Продолжить редактирование» — окно открыто, текст на месте
  await page.keyboard.press('Escape')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('Несохранённый текст пропадёт.')
  await confirm.getByRole('button', { name: 'Продолжить редактирование' }).click()
  await expect(confirm).toBeHidden()
  await expect(window).toBeVisible()
  await expect(comment).toHaveText('Черновик')

  // 5. Щелчок мимо окна — тот же вопрос; «Продолжить редактирование»
  const box = (await window.boundingBox())!
  await page.mouse.click(box.x + box.width + 80, box.y + 300)
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Продолжить редактирование' }).click()
  await expect(confirm).toBeHidden()
  await expect(window).toBeVisible()
  await expect(comment).toHaveText('Черновик')
  await expect(page).toHaveURL(/\/cards\/WIN-\d+$/)

  // 6. «Назад» — вопрос; «Закрыть без сохранения»: окно закрылось, доска на прежнем месте
  await page.goBack()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Закрыть без сохранения' }).click()
  await expect(window).toBeHidden()
  expect(page.url()).toBe(boardUrl)
  expect(await canvasScroll(page)).toBe(scroll)

  // Без текста (шаг 3 с пустым комментарием) окно закрывается сразу, без вопроса
  await tile(page, 'Просто карточка').click()
  await expect(window).toBeVisible()
  await expect(comment).toHaveText('')
  await comment.click()
  await page.keyboard.press('Escape')
  await expect(comment).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await expect(confirm).toHaveCount(0)
  expect(page.url()).toBe(boardUrl)
})
