import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/** Доска «Процесс»: перетаскивание карточек и горизонтальная прокрутка. */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')
})

/** Перетаскивание мышью по шагам: dnd-kit начинает перенос после смещения на 5 px. */
async function drag(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 20 })
  await page.mouse.up()
}

test('создать карточку и перетащить в другую колонку; после перезагрузки она на новом месте', async ({ page }) => {
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  const inProgress = page.getByRole('group', { name: 'In Progress', exact: true })

  // Создание прямо в ячейке To Do
  await page.getByRole('button', { name: 'Добавить карточку в To Do' }).click()
  await page.getByRole('textbox', { name: 'Добавить карточку в To Do' }).fill('Перетаскиваемая карточка')
  await page.keyboard.press('Enter')
  const card = page.getByRole('button', { name: /^Открыть QA-\d+: Перетаскиваемая карточка$/ })
  await expect(todo.locator(card)).toBeVisible()
  await page.keyboard.press('Escape')

  // Перетаскивание в In Progress и ответ сервера
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await drag(page, card, inProgress)
  expect((await moved).status()).toBe(200)
  await expect(inProgress.locator(card)).toBeVisible()

  // После перезагрузки — там же
  await page.reload()
  await expect(page.getByRole('group', { name: 'In Progress', exact: true }).locator(card)).toBeVisible()
  await expect(page.getByRole('group', { name: 'To Do', exact: true }).locator(card)).toHaveCount(0)

  // История перемещений в панели карточки
  await card.click()
  await expect(page).toHaveURL(/\/cards\/QA-\d+$/)
  await expect(page.getByRole('dialog').getByText('To Do → In Progress')).toBeVisible()
})

/**
 * Широкая доска (8 колонок шире окна): по горизонтали прокручивается только область доски, страница — на месте.
 * Раньше скрытые подписи карточек для скринридеров (sr-only, position: absolute) отсчитывались от корня
 * документа, не обрезались контейнером доски и растягивали всю страницу: она уезжала вбок вместе с шапкой,
 * а карточки — под панель дерева. Нужна карточка с такой подписью за краем окна — QA-5 со сроком (E2eSeeder).
 */

async function expectOnlyBoardScrolls(page: Page) {
  const lastCell = page.getByRole('group', { name: 'Done', exact: true })
  const m = await lastCell.evaluate((cell) => {
    // Область доски — ближайший предок ячейки с горизонтальной прокруткой
    let board = cell.parentElement!
    while (getComputedStyle(board).overflowX === 'visible') board = board.parentElement!
    board.scrollLeft = board.scrollWidth
    // Попытка прокрутить вбок саму страницу — её не должно быть куда прокручивать
    window.scrollTo(10_000, window.scrollY)
    const area = board.getBoundingClientRect()
    return {
      boardOverflows: board.scrollWidth > board.clientWidth,
      boardScrolled: board.scrollLeft,
      pageScrollWidth: document.documentElement.scrollWidth,
      windowWidth: document.documentElement.clientWidth,
      pageScrollX: window.scrollX,
      boardLeft: area.left,
      boardRight: area.right,
      lastColumnRight: cell.getBoundingClientRect().right,
      // Отступ блока доски справа от последней колонки (LATER-65) — как слева
      endPadding: parseFloat(getComputedStyle(board.firstElementChild!).paddingRight),
      panelRight: document.querySelector('aside')!.getBoundingClientRect().right,
    }
  })

  expect(m.boardOverflows).toBe(true)
  // У страницы нет горизонтальной прокрутки — сдвинулась только доска
  expect(m.pageScrollWidth).toBe(m.windowWidth)
  expect(m.pageScrollX).toBe(0)
  expect(m.boardScrolled).toBeGreaterThan(0)
  // Прокрутка заканчивается на последней колонке и отступе блока (LATER-65), без пустого хвоста справа
  expect(m.endPadding).toBeLessThanOrEqual(16)
  expect(Math.abs(m.boardRight - m.lastColumnRight - m.endPadding)).toBeLessThanOrEqual(1)
  // Панель дерева не перекрывает область доски
  expect(m.boardLeft).toBeGreaterThanOrEqual(m.panelRight)

  // Шапка и панель доски остались на месте
  await expect(page.getByRole('button', { name: 'Меню пользователя' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Действия с доской' })).toBeInViewport()
  await expect(page.getByRole('button', { name: /^Открыть QA-5:/ })).toBeInViewport()
}

test('широкая доска: по горизонтали прокручивается только доска — с панелью дерева и без неё @tc-hotfix.1', async ({ page }) => {
  await expectOnlyBoardScrolls(page)

  await page.getByRole('button', { name: 'Свернуть панель' }).click()
  await expect(page.getByRole('navigation', { name: 'Дерево' })).toBeHidden()
  await expectOnlyBoardScrolls(page)
})

test('перетаскивание карточки к правому краю прокручивает доску, а не страницу', async ({ page }) => {
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  const card = todo.getByRole('button', { name: /^Открыть QA-1:/ })
  const scrolls = () =>
    todo.evaluate((cell) => {
      let board = cell.parentElement!
      while (getComputedStyle(board).overflowX === 'visible') board = board.parentElement!
      return { board: board.scrollLeft, right: board.getBoundingClientRect().right, page: window.scrollX }
    })

  const from = (await card.boundingBox())!
  const { right } = await scrolls()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 })
  await page.mouse.move(right - 10, from.y + from.height / 2, { steps: 20 })

  await expect.poll(async () => (await scrolls()).board).toBeGreaterThan(0)
  expect((await scrolls()).page).toBe(0)

  // Отмена переноса: карточка остаётся на месте
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(card).toBeVisible()
})

/**
 * Быстрое перетаскивание туда-обратно между соседними колонками без пауз («Плотная доска»: карточки разной высоты).
 * Раньше колонка-цель определялась по ближайшим углам карточек: перенос карточки сдвигал обе колонки, ближайшей
 * становилась карточка соседней колонки — карточка металась между колонками каждый кадр, и React падал
 * с «Maximum update depth exceeded».
 */
test('быстрое перетаскивание туда-обратно между колонками не роняет приложение @tc-hotfix.3', async ({ page }) => {
  test.setTimeout(90_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => message.type() === 'error' && /Maximum update depth|#185/.test(message.text()) && errors.push(message.text()))

  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  const inProgress = page.getByRole('group', { name: 'In Progress', exact: true })
  const crashed = async () =>
    (await page.getByText(/Unexpected Application Error|Что-то пошло не так/).count()) > 0 || errors.length > 0

  const left = (await todo.boundingBox())!
  const right = (await inProgress.boundingBox())!
  const leftX = left.x + left.width / 2
  const rightX = right.x + right.width / 2
  const border = (left.x + left.width + right.x) / 2

  // Указатель — вне полос автопрокрутки у краёв холста (20 % его высоты): холст не должен уезжать во время серий
  const safeY = (y: number) => Math.min(Math.max(y, 260), 600)

  // Серии махов: разные карточки и высоты указателя; широкие махи и дрожь у границы колонок, без пауз.
  // Каждая серия отменяется (Esc) — данные не меняются
  for (const index of [1, 3, 5]) {
    for (const dy of [0, 120, 240]) {
      const card = todo.getByRole('button', { name: /^Открыть QA-/ }).nth(index)
      await card.scrollIntoViewIfNeeded()
      const from = (await card.boundingBox())!
      const y = safeY(from.y + from.height / 2 + dy)
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 })
      for (let i = 0; i < 6; i++) {
        await page.mouse.move(rightX, y, { steps: 2 })
        await page.mouse.move(leftX, y, { steps: 2 })
      }
      for (let i = 0; i < 24; i++) await page.mouse.move(border + (i % 2 ? 40 : -40), y + (i % 4) * 15)
      await page.keyboard.press('Escape')
      await page.mouse.up()
      expect(await crashed(), `серия: карточка ${index}, смещение ${dy}`).toBe(false)
    }
  }

  // Финал: махи и отпускание над In Progress — карточка встаёт в колонку под курсором
  // Холст страницы доски — в начало (окно не прокручивается, ADR-0019)
  await page.evaluate(() => (document.querySelector('[data-board-canvas]')!.scrollTop = 0))
  const card = todo.getByRole('button', { name: /^Открыть QA-/ }).nth(2)
  const name = (await card.getAttribute('aria-label'))!
  const from = (await card.boundingBox())!
  const y = safeY(from.y + from.height / 2)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 })
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(rightX, y, { steps: 2 })
    await page.mouse.move(leftX, y, { steps: 2 })
  }
  await page.mouse.move(rightX, y, { steps: 2 })
  // Отпускаем, как человек, когда карточка уже показана в колонке под курсором
  await expect(inProgress.getByRole('button', { name, exact: true })).toBeVisible()
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  expect((await moved).status()).toBe(200)

  await expect(inProgress.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(todo.getByRole('button', { name, exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Плотная доска' })).toBeVisible()
  expect(await crashed()).toBe(false)
})
