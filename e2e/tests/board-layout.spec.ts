import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Раскладка страницы доски (LATER-4, LATER-50, ADR-0019): окно не прокручивается, по вертикали прокручивается
 * холст страницы, вбок — тело доски; верхняя панель, шапка доски и заголовки колонок остаются на экране; полоса
 * прокрутки вбок — внизу окна; горизонтальное колесо над заголовками и полосой двигает доску; «Назад» возвращает
 * прежнее место. «Длинная доска» пространства «Раскладка» (E2eSeeder) шире и выше окна: 8 колонок, 30 карточек в To Do.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
})

/** Положения прокруток: холст (вертикаль), тело доски, заголовки и полоса (вбок), окно. */
function scrolls(page: Page) {
  return page.evaluate(() => {
    const q = (selector: string) => document.querySelector(selector)!
    return {
      canvas: q('[data-board-canvas]').scrollTop,
      body: q('[data-board-body]').scrollLeft,
      header: q('[data-board-columns]').scrollLeft,
      bar: q('[data-board-scrollbar]').scrollLeft,
      window: [window.scrollX, window.scrollY],
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }
  })
}

/** Элемент виден и ничем не перекрыт: в его центре — он сам (а не закреплённая шапка или карточка поверх). */
async function expectOnTop(locator: Locator) {
  await expect(locator).toBeInViewport()
  const onTop = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return hit !== null && (element === hit || element.contains(hit))
  })
  expect(onTop).toBe(true)
}

async function wheelOver(page: Page, locator: Locator, dx: number, dy: number) {
  const box = (await locator.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(dx, dy)
}

const card = (page: Page, n: number) =>
  page.getByRole('button', { name: new RegExp(`^Открыть LAYOUT-\\d+: Карточка длинной доски ${n}$`) })

/** Колесо над холстом доски — в видимой точке (центр высокой ячейки может быть далеко за краем окна). */
async function wheelCanvas(page: Page, dy: number) {
  const box = (await page.locator('[data-board-canvas]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6)
  await page.mouse.wheel(0, dy)
}

test('прокрутка вниз: верхняя панель, шапка доски и заголовки колонок на месте, уезжают только карточки', async ({ page }) => {
  await expect(card(page, 1)).toBeInViewport()
  await wheelCanvas(page, 2000)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)

  await expect(card(page, 1)).not.toBeInViewport()
  await expectOnTop(page.getByRole('button', { name: 'Меню пользователя' }))
  await expectOnTop(page.getByRole('heading', { name: 'Длинная доска' }))
  await expectOnTop(page.getByRole('button', { name: 'Добавить карточку в начало To Do' }))
  await expectOnTop(page.getByRole('button', { name: 'Действия с доской' }))

  // Окно не прокручивается: страница ровно в высоту окна
  const s = await scrolls(page)
  expect(s.window).toEqual([0, 0])
  expect(s.pageHeight).toBe(s.viewportHeight)
})

test('полоса прокрутки вбок — внизу окна; колесо вбок над заголовками и над полосой двигает доску вместе с заголовками', async ({ page }) => {
  const bar = page.locator('[data-board-scrollbar]')
  const barBox = (await bar.boundingBox())!
  expect(Math.abs(barBox.y + barBox.height - page.viewportSize()!.height)).toBeLessThanOrEqual(1)

  // Горизонтальный жест тачпада над заголовками колонок
  await wheelOver(page, page.locator('[data-board-columns]'), 400, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(0)
  let s = await scrolls(page)
  expect(s.header).toBe(s.body)
  expect(s.bar).toBe(s.body)
  expect(s.canvas).toBe(0)

  // Shift+колесо мыши над заголовками
  const before = s.body
  await page.keyboard.down('Shift')
  await wheelOver(page, page.locator('[data-board-columns]'), 0, 300)
  await page.keyboard.up('Shift')
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(before)
  expect((await scrolls(page)).canvas).toBe(0)

  // Над полосой внизу — обратно
  await wheelOver(page, bar, -10_000, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBe(0)
  s = await scrolls(page)
  expect(s.header).toBe(0)

  // Заголовок колонки стоит ровно над своей колонкой и после прокрутки вбок
  await wheelOver(page, page.locator('[data-board-columns]'), 10_000, 0)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(0)
  const aligned = await page.evaluate(() => {
    const header = [...document.querySelectorAll('[data-board-columns] span')].find(
      (e) => e.textContent === 'Done',
    )!.closest('.w-68')!
    const cell = document.querySelector('[role="group"][aria-label="Done"]')!
    return Math.abs(header.getBoundingClientRect().left - cell.getBoundingClientRect().left)
  })
  expect(aligned).toBeLessThanOrEqual(1)
})

test('перетаскивание к нижнему краю окна прокручивает холст, окно на месте', async ({ page }) => {
  const source = card(page, 2)
  const from = (await source.boundingBox())!
  const height = page.viewportSize()!.height
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 })
  await page.mouse.move(from.x + from.width / 2, height - 15, { steps: 20 })

  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(100)
  expect((await scrolls(page)).window).toEqual([0, 0])

  // Отмена переноса: карточка на месте
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByRole('group', { name: 'To Do', exact: true }).locator(source)).toHaveCount(1)
})

test('после прокрутки вниз «+» в заголовке колонки открывает форму в начале колонки — её видно под шапкой', async ({ page }) => {
  await wheelCanvas(page, 2000)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)

  await page.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
  const field = page.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })
  await expect(field).toBeFocused()
  await expectOnTop(field)
  await page.keyboard.press('Escape')
})

test('«+ Карточка» под последней карточкой длинной колонки — форма видна', async ({ page }) => {
  const todo = page.getByRole('group', { name: 'To Do', exact: true })
  const add = page.getByRole('button', { name: 'Добавить карточку в To Do', exact: true })
  await add.scrollIntoViewIfNeeded()
  await todo.locator('[data-reveal="hover"]').hover()
  await add.click()
  const field = page.getByRole('textbox', { name: 'Добавить карточку в To Do', exact: true })
  await expect(field).toBeFocused()
  await expectOnTop(field)
  await page.keyboard.press('Escape')
})

test('окно карточки открывается поверх доски; после закрытия доска на том же месте', async ({ page }) => {
  const target = card(page, 20)
  await target.scrollIntoViewIfNeeded()
  const opened = (await scrolls(page)).canvas
  await target.click()
  await expect(page).toHaveURL(/\/cards\/LAYOUT-\d+$/)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await scrolls(page)).canvas).toBe(opened)

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page).toHaveURL(/\/boards\//)
  expect((await scrolls(page)).canvas).toBe(opened)
  expect(opened).toBeGreaterThan(0)
})

test('«Назад» возвращает прежнее место прокрутки доски; новая страница открывается с начала', async ({ page }) => {
  await wheelCanvas(page, 1500)
  await wheelOver(page, page.locator('[data-board-columns]'), 500, 0)
  await expect.poll(async () => (await scrolls(page)).canvas).toBeGreaterThan(1000)
  await expect.poll(async () => (await scrolls(page)).body).toBeGreaterThan(0)
  const saved = await scrolls(page)

  // Другая страница (пространство — по ссылке над доской), затем «Назад»
  await page.getByRole('link', { name: 'Раскладка', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Раскладка', level: 1 })).toBeVisible()
  // Страница пространства — тоже холст (ADR-0019, PR 3): с начала — его прокрутка
  await expect(page.locator('[data-board-canvas]')).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('[data-board-canvas]')!.scrollTop)).toBe(0)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Длинная доска' })).toBeVisible()
  await expect.poll(async () => (await scrolls(page)).canvas).toBe(saved.canvas)
  const s = await scrolls(page)
  expect(s.body).toBe(saved.body)
  expect(s.header).toBe(saved.body)
})

test('перенос карточки с клавиатуры: пробел — взять, стрелка вправо, пробел — положить', async ({ page }) => {
  const source = card(page, 30)
  await source.scrollIntoViewIfNeeded()
  await source.focus()
  // Как слышит пользователь скринридера: после каждого нажатия — объявление, где карточка
  const announced = (text: RegExp) => expect(page.getByText(text)).toBeAttached()
  await page.keyboard.press('Space')
  await announced(/над ячейкой «To Do»/)
  // dnd-kit начинает слушать стрелки через setTimeout после взятия карточки: без паузы стрелку успевает обработать
  // браузер (прокрутка тела на 40 px), как не бывает у человека
  await page.waitForTimeout(150)
  await page.keyboard.press('ArrowRight')
  await announced(/над ячейкой «In Progress»/)
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.keyboard.press('Space')
  expect((await moved).status()).toBe(200)
  await expect(page.getByRole('group', { name: 'In Progress', exact: true }).locator(source)).toHaveCount(1)
  expect((await scrolls(page)).window).toEqual([0, 0])
})

/** Где блок доски и холст и что на холсте рядом с блоком (поправка PM к LATER-50, 19.10). */
function blockOnCanvas(page: Page) {
  return page.evaluate(() => {
    const block = document.querySelector('section[aria-label]')!.getBoundingClientRect()
    const canvas = document.querySelector('[data-board-canvas]')!
    const area = canvas.getBoundingClientRect()
    const outside = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)
      return hit !== null && canvas.contains(hit) && hit.closest('section[aria-label]') === null
    }
    return {
      block: { left: block.left, right: block.right, top: block.top, bottom: block.bottom },
      canvas: { right: area.right, bottom: area.bottom },
      // Справа от блока и под ним — фон холста, а не доска
      canvasRight: outside(block.right + 20, block.top + 60),
      canvasBelow: block.bottom < area.bottom - 20 && outside(block.left + 60, block.bottom + 10),
      background: getComputedStyle(canvas).backgroundColor,
      blockBackground: getComputedStyle(document.querySelector('section[aria-label]')!).backgroundColor,
    }
  })
}

test('доска с 4 колонками на широком экране — блок по ширине колонок, справа и снизу фон холста', async ({ page }) => {
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')

  const m = await blockOnCanvas(page)
  expect(m.block.right).toBeLessThan(m.canvas.right - 100)
  expect(m.canvasRight).toBe(true)
  expect(m.background).not.toBe(m.blockBackground)
  // Тело не прокручивается вбок: колонки помещаются
  expect(await page.evaluate(() => {
    const body = document.querySelector('[data-board-body]')!
    return body.scrollWidth - body.clientWidth
  })).toBeLessThanOrEqual(1)
})

test('доска без карточек — высота по содержимому, под ней фон холста', async ({ page }) => {
  await openBoard(page, 'Сквозные тесты', 'Дорожки')

  const m = await blockOnCanvas(page)
  expect(m.canvasBelow).toBe(true)
  expect(m.block.bottom - m.block.top).toBeGreaterThanOrEqual(240)
})

test('доска шире экрана — блок во всю ширину холста, прокрутка вбок внутри блока', async ({ page }) => {
  const m = await blockOnCanvas(page)
  // Справа от блока — только отступ холста
  expect(m.canvas.right - m.block.right).toBeLessThanOrEqual(24)
  const overflow = await page.evaluate(() => {
    const body = document.querySelector('[data-board-body]')!
    return body.scrollWidth - body.clientWidth
  })
  expect(overflow).toBeGreaterThan(0)
})

/**
 * Отступы блока доски (LATER-65): слева от первой колонки и справа от последней (после прокрутки до конца) — такой же
 * отступ от края блока, как у строки с названием доски.
 */
async function paddings(page: Page) {
  return page.evaluate(async () => {
    const block = document.querySelector('section[aria-label]')!
    const edge = block.getBoundingClientRect()
    const title = block.querySelector('header')!.firstElementChild!.getBoundingClientRect()
    const headers = [...document.querySelectorAll('[data-board-columns] > div > div')]
    const body = document.querySelector('[data-board-body]')!
    body.scrollLeft = 0
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const first = headers[0].getBoundingClientRect()
    body.scrollLeft = body.scrollWidth
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const last = headers[headers.length - 1].getBoundingClientRect()
    const cells = [...document.querySelectorAll('[role="group"]')]
    const lastCell = cells[cells.length - 1].getBoundingClientRect()
    return {
      title: title.left - edge.left,
      firstColumn: first.left - edge.left,
      lastColumn: edge.right - last.right,
      lastCell: edge.right - lastCell.right,
    }
  })
}

test('отступы блока: первая и последняя колонки — с тем же отступом от края, что и название доски (LATER-65)', async ({ page }) => {
  // Широкая доска — после прокрутки до конца
  let p = await paddings(page)
  expect(Math.abs(p.firstColumn - p.title)).toBeLessThanOrEqual(1)
  expect(Math.abs(p.lastColumn - p.title)).toBeLessThanOrEqual(1)
  expect(Math.abs(p.lastCell - p.title)).toBeLessThanOrEqual(1)

  // Узкая доска (колонки помещаются)
  await openBoard(page, 'Сквозные тесты', 'Плотная доска')
  p = await paddings(page)
  expect(Math.abs(p.firstColumn - p.title)).toBeLessThanOrEqual(1)
  expect(Math.abs(p.lastColumn - p.title)).toBeLessThanOrEqual(1)
})

/**
 * Туда и обратно (LATER-66): узкая доска после перехода в другое пространство (на широкую доску или страницу
 * пространства) и возврата — через дерево и «Назад» — того же размера, что при первом открытии. Раньше страница доски
 * не пересоздавалась, полоса прокрутки внизу оставалась шириной прежней широкой доски и растягивала блок, а растянутый
 * блок сам поддерживал эту ширину — до обновления страницы.
 */
test('узкая доска после перехода в другое пространство и возврата — по ширине колонок, как при первом открытии (LATER-66)', async ({ page }) => {
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  // Доска из дерева открывается на странице своего пространства среди других его досок (ADR-0019, PR 3) — меряем
  // блок именно этой доски
  const blockWidth = () =>
    page.evaluate(() =>
      document.querySelector('[data-board-canvas] section[aria-label="Плотная доска"]')!.getBoundingClientRect().width,
    )
  const openFromTree = async (name: string) => {
    await tree.getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('heading', { name })).toBeVisible()
  }
  const viewport = page.viewportSize()!.width

  await tree.getByRole('button', { name: 'Раскрыть «Сквозные тесты»' }).click()
  await openFromTree('Плотная доска')
  const first = await blockWidth()
  expect(first).toBeLessThan(viewport - 400)

  // Через дерево: широкая доска другого пространства и обратно
  await openFromTree('Длинная доска')
  await openFromTree('Плотная доска')
  await expect.poll(blockWidth).toBe(first)

  // «Назад» с широкой доски
  await openFromTree('Длинная доска')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Плотная доска' })).toBeVisible()
  await expect.poll(blockWidth).toBe(first)

  // Страница другого пространства и обратно — через дерево и «Назад»
  await tree.getByRole('link', { name: /Раскладка/ }).click()
  await expect(page.getByRole('heading', { name: 'Раскладка', level: 1 })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Плотная доска' })).toBeVisible()
  await expect.poll(blockWidth).toBe(first)
  await tree.getByRole('link', { name: /Раскладка/ }).click()
  await openFromTree('Плотная доска')
  await expect.poll(blockWidth).toBe(first)
})
