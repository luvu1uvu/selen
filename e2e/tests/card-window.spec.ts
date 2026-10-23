import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Окно карточки (UI-1a, README Kaiten, раздел 02): большое модальное окно поверх доски со своим адресом; закрытие —
 * Esc, щелчок мимо, ✕, «Назад» — доска на том же месте; прямой адрес; на узком экране — на весь экран; несохранённый
 * текст не теряется молча; файл, брошенный на окно, прикладывается. «Длинная доска» пространства «Раскладка»
 * (E2eSeeder) выше окна — холст прокручивается.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const canvasScroll = (page: Page) =>
  page.locator('[data-board-canvas]').evaluate((canvas) => canvas.scrollTop)

/**
 * Длинная доска, холст прокручен вниз так, что карточка — посередине экрана (не под закреплёнными заголовками: щелчок
 * по частично закрытой карточке прокручивает холст к ней — так было и до окна). Возвращает плитку, адрес доски и место
 * прокрутки.
 */
async function scrolledBoard(page: Page) {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  const boardUrl = page.url()
  const tile = page.getByRole('button', { name: /^Открыть LAYOUT-20:/ })
  await tile.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect(tile).toBeInViewport()
  const scroll = await canvasScroll(page)
  expect(scroll).toBeGreaterThan(300)
  return { tile, boardUrl, scroll }
}

test('открытие с доски и закрытие: Esc, щелчок мимо, ✕ — доска на том же месте', async ({ page }) => {
  const { tile, boardUrl, scroll } = await scrolledBoard(page)

  for (const close of ['Escape', 'outside', 'button'] as const) {
    await tile.click()
    const window = page.getByRole('dialog', { name: /Карточка длинной доски 20/ })
    await expect(window).toBeVisible()
    await expect(page).toHaveURL(/\/cards\/LAYOUT-20$/)
    expect(await canvasScroll(page)).toBe(scroll)
    // Около 800 px шириной (max-w-3xl), у верха экрана
    const box = (await window.boundingBox())!
    expect(box.width).toBeGreaterThan(700)
    expect(box.width).toBeLessThanOrEqual(768)
    expect(box.y).toBeLessThanOrEqual(40)

    if (close === 'Escape') await page.keyboard.press('Escape')
    else if (close === 'outside') await page.mouse.click(10, 400)
    else await window.getByRole('button', { name: 'Закрыть' }).click()

    await expect(window).toBeHidden()
    expect(page.url()).toBe(boardUrl)
    expect(await canvasScroll(page)).toBe(scroll)
  }
})

test('«Назад» закрывает окно, «Вперёд» открывает снова', async ({ page }) => {
  const { tile, boardUrl, scroll } = await scrolledBoard(page)
  await tile.click()
  const window = page.getByRole('dialog', { name: /Карточка длинной доски 20/ })
  await expect(window).toBeVisible()

  await page.goBack()
  await expect(window).toBeHidden()
  expect(page.url()).toBe(boardUrl)
  expect(await canvasScroll(page)).toBe(scroll)

  await page.goForward()
  await expect(window).toBeVisible()
  await expect(page).toHaveURL(/\/cards\/LAYOUT-20$/)
})

test('прямой адрес /cards/KEY-N открывает доску и окно поверх; закрытие — адрес доски', async ({ page }) => {
  await page.goto('/cards/LAYOUT-3')
  const window = page.getByRole('dialog', { name: /Карточка длинной доски 3/ })
  await expect(window).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Длинная доска', includeHidden: true })).toBeAttached()

  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await expect(page).toHaveURL(/\/boards\/[0-9a-z]+$/)
  await expect(page.getByRole('heading', { name: 'Длинная доска' })).toBeVisible()
})

test('на узком экране окно — на весь экран', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await page.goto('/cards/LAYOUT-3')
  const window = page.getByRole('dialog', { name: /Карточка длинной доски 3/ })
  await expect(window).toBeVisible()

  expect(await window.boundingBox()).toEqual({ x: 0, y: 0, width: 375, height: 740 })
  // Горизонтальной прокрутки внутри окна нет
  const overflow = await window.evaluate((element) => {
    const scroller = element.querySelector('.overflow-y-auto')!
    return scroller.scrollWidth - scroller.clientWidth
  })
  expect(overflow).toBe(0)
  await window.getByRole('button', { name: 'Закрыть' }).click()
  await expect(window).toBeHidden()
})

test('несохранённый текст: первый Esc выводит из поля, закрытие спрашивает «Закрыть без сохранения?»', async ({
  page,
}) => {
  const { tile, boardUrl, scroll } = await scrolledBoard(page)
  await tile.click()
  const window = page.getByRole('dialog', { name: /Карточка длинной доски 20/ })
  const comment = window.getByRole('textbox', { name: 'Новый комментарий' })
  await comment.click()
  await page.keyboard.type('Черновик')

  // Первый Esc — выход из поля, окно на месте
  await page.keyboard.press('Escape')
  await expect(comment).not.toBeFocused()
  await expect(window).toBeVisible()

  // Второй Esc — вопрос; «Продолжить редактирование» — остаёмся с текстом
  await page.keyboard.press('Escape')
  const confirm = page.getByRole('dialog', { name: 'Закрыть без сохранения?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Продолжить редактирование' }).click()
  await expect(confirm).toBeHidden()
  await expect(comment).toHaveText('Черновик')
  // Курсор снова в поле комментария — понятно, где продолжать
  await expect(comment).toBeFocused()

  // Щелчок мимо окна — тот же вопрос
  await page.mouse.click(10, 400)
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Продолжить редактирование' }).click()
  await expect(page).toHaveURL(/\/cards\/LAYOUT-20$/)

  // «Назад» — вопрос; «Закрыть без сохранения» — окно закрыто, доска на месте
  await page.goBack()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Закрыть без сохранения' }).click()
  await expect(window).toBeHidden()
  expect(page.url()).toBe(boardUrl)
  expect(await canvasScroll(page)).toBe(scroll)
})

test('файл, брошенный на окно, становится вложением', async ({ page }) => {
  await page.goto('/cards/QA-3')
  const window = page.getByRole('dialog', { name: 'Блокирующая задача' })
  await expect(window).toBeVisible()
  const description = window.getByRole('region', { name: 'Описание' })

  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['заметки'], 'перетащенный.txt', { type: 'text/plain' }))
    return transfer
  })
  await description.dispatchEvent('dragenter', { dataTransfer })
  await expect(window.getByText('Отпустите, чтобы приложить файл')).toBeVisible()
  await description.dispatchEvent('dragover', { dataTransfer })
  await description.dispatchEvent('drop', { dataTransfer })

  await expect(page.getByText('Файл «перетащенный.txt» приложен')).toBeVisible()
  await expect(
    window.getByRole('region', { name: 'Файлы' }).getByRole('link', { name: 'перетащенный.txt', exact: true }),
  ).toBeVisible()
  await expect(window.getByText('Отпустите, чтобы приложить файл')).toBeHidden()
})

test('превью картинки с фокусом с клавиатуры — рамка вокруг превью видна (U-3 UX-ревью)', async ({ page }) => {
  // Непрозрачная картинка 1×1: рамка, нарисованная под картинкой, была бы не видна
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.goto('/cards/QA-3')
  const window = page.getByRole('dialog', { name: 'Блокирующая задача' })
  await window.getByLabel('Выбрать файлы').setInputFiles([{ name: 'непрозрачная.png', mimeType: 'image/png', buffer: png }])
  const preview = window.getByRole('button', { name: 'Открыть «непрозрачная.png»' })
  await expect(preview).toBeVisible()

  // Фокус с клавиатуры: Shift+Tab и обратно Tab
  await preview.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(preview).toBeFocused()
  const figure = preview.locator('xpath=ancestor::figure[1]')
  const ring = await figure.evaluate((element) => getComputedStyle(element).boxShadow)
  expect(ring).toMatch(/3px/)
})
