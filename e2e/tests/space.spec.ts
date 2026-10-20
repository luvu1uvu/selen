import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard, pageAs } from './helpers'

/**
 * Страница пространства — все доски рядами (LATER-55, PR 3 пакета «Раскладка», ADR-0019). Пространство ROWS «Ряды»
 * (E2eSeeder): ряды [«Узкая» (2 колонки), «Широкая» (8 колонок)], [«Высокая» (40 карточек в To Do)], [«Нижняя»];
 * e2e-editor — editor, e2e-restricted — editor «только свои». Сворачивание личное и хранится на сервере — каждый тест
 * возвращает доски развёрнутыми.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const block = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

/** Прямоугольник блока доски (а не места в ряду) и холста. */
function rect(page: Page, name: string) {
  return page.evaluate((name) => {
    const box = document.querySelector(`section[aria-label="${name}"]`)!.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height }
  }, name)
}

function canvasRect(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-board-canvas]')!
    const box = canvas.getBoundingClientRect()
    return { left: box.left, right: box.right, top: box.top, scrollTop: canvas.scrollTop }
  })
}

/** Доска загружена (не заглушка): у неё есть тело с колонками. */
async function loaded(page: Page, name: string) {
  await expect(block(page, name).locator('[data-board-body]')).toBeVisible()
}

async function openRows(page: Page) {
  await page.goto('/spaces/ROWS')
  await expect(page.getByRole('heading', { name: 'Ряды', level: 1 })).toBeVisible()
  await loaded(page, 'Узкая')
  await loaded(page, 'Широкая')
}

/** Развернуть доски, которые пользователь свернул (сворачивание хранится на сервере). */
async function expandAll(page: Page) {
  const expand = page.getByRole('button', { name: /^Развернуть доску/ })
  for (let left = await expand.count(); left > 0; left--) {
    await expand.first().click()
    await expect(expand).toHaveCount(left - 1)
  }
}

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openRows(page)
  await expandAll(page)
})

test('доски рядами: узкая — по своим колонкам, широкая — остаток ряда и прокрутка вбок внутри блока', async ({ page }) => {
  const narrow = await rect(page, 'Узкая')
  const wide = await rect(page, 'Широкая')
  const tall = await rect(page, 'Высокая')
  const canvas = await canvasRect(page)

  // Один ряд: верх одинаковый, «Широкая» — справа через зазор 12 px и до края холста (с его отступом)
  expect(Math.abs(narrow.top - wide.top)).toBeLessThanOrEqual(1)
  expect(Math.round(wide.left - narrow.right)).toBe(12)
  expect(canvas.right - wide.right).toBeLessThanOrEqual(24)
  // Узкая — ровно по двум колонкам (2 × 272 + зазор 8 + отступы 2 × 12 + граница 2), без прокрутки вбок
  expect(Math.round(narrow.width)).toBe(578)
  const overflow = (name: string) =>
    block(page, name)
      .locator('[data-board-body]')
      .evaluate((body) => body.scrollWidth - body.clientWidth)
  expect(await overflow('Узкая')).toBeLessThanOrEqual(1)
  expect(await overflow('Широкая')).toBeGreaterThan(100)

  // Высота — по содержимому (ответ PM 20.10): под более короткой доской ряда — фон холста
  expect(Math.abs(narrow.height - wide.height)).toBeGreaterThan(20)
  const short = narrow.bottom < wide.bottom ? narrow : wide
  const below = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.hasAttribute('data-board-row') ?? false,
    { x: short.left + 40, y: short.bottom + 8 },
  )
  expect(below).toBe(true)

  // Следующий ряд — под самой высокой доской ряда, от левого края
  expect(tall.top).toBeGreaterThan(Math.max(narrow.bottom, wide.bottom))
  expect(Math.abs(tall.left - narrow.left)).toBeLessThanOrEqual(1)

  // Доска одна в ряду и помещается — по ширине колонок (4 колонки), справа фон холста
  await loaded(page, 'Нижняя')
  expect(Math.round((await rect(page, 'Нижняя')).width)).toBe(4 * 272 + 3 * 8 + 26)
  // Холст вбок не прокручивается
  expect(
    await page.evaluate(() => {
      const canvas = document.querySelector('[data-board-canvas]')!
      return canvas.scrollWidth - canvas.clientWidth
    }),
  ).toBeLessThanOrEqual(0)
})

test('шапка и заголовки колонок каждой доски закреплены, пока она на экране; отступы блока как у названия (LATER-65)', async ({ page }) => {
  // Внутри «Высокой»: её шапка — у верха холста, заголовки колонок — под шапкой
  await block(page, 'Высокая').evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top + 800
  })
  await loaded(page, 'Высокая')
  const canvas = await canvasRect(page)
  const header = block(page, 'Высокая').locator('header')
  await expect.poll(async () => Math.abs((await header.boundingBox())!.y - canvas.top)).toBeLessThanOrEqual(1)
  const columns = block(page, 'Высокая').locator('[data-board-columns]')
  const headerBox = (await header.boundingBox())!
  expect(Math.abs((await columns.boundingBox())!.y - (headerBox.y + headerBox.height))).toBeLessThanOrEqual(2)

  // Доски ряда выше уехали вверх целиком — их шапки ушли вместе с ними, а не остались поверх «Высокой»
  for (const name of ['Узкая', 'Широкая']) {
    const other = block(page, name).locator('header')
    expect((await other.boundingBox())!.y + 48).toBeLessThanOrEqual(canvas.top)
  }

  // Отступы колонок от края блока — как у названия доски, в начале и в конце прокрутки вбок
  const paddings = await block(page, 'Широкая').evaluate(async (section) => {
    const edge = section.getBoundingClientRect()
    const title = section.querySelector('header h2')!.getBoundingClientRect()
    const body = section.querySelector('[data-board-body]')!
    const cells = () => [...section.querySelectorAll('[data-board-body] [role="group"]')].map((c) => c.getBoundingClientRect())
    body.scrollLeft = 0
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const first = cells()[0].left - edge.left
    body.scrollLeft = body.scrollWidth
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const all = cells()
    return { title: title.left - edge.left, first, last: edge.right - all[all.length - 1].right }
  })
  // Слева от названия — ручки ⠿ нет (editor), отступ — как у колонок
  expect(Math.abs(paddings.first - paddings.title)).toBeLessThanOrEqual(1)
  expect(Math.abs(paddings.last - paddings.title)).toBeLessThanOrEqual(1)
})

test('свернуть доску: «Название · N карточек», блок по шапке, сосед справа сдвигается; личное и после перезагрузки', async ({ page, browser }) => {
  const wideBefore = await rect(page, 'Широкая')
  await block(page, 'Узкая').getByRole('button', { name: 'Свернуть доску «Узкая»' }).click()

  const collapsed = block(page, 'Узкая')
  await expect(collapsed).toContainText('Узкая· 3 карточки')
  await expect(collapsed.locator('[data-board-body]')).toHaveCount(0)
  await expect(collapsed.getByRole('button', { name: 'Развернуть доску «Узкая»' })).toHaveAttribute('aria-expanded', 'false')
  // Блок — по шапке (уже 20rem), «Широкая» сдвинулась влево к нему
  const narrow = await rect(page, 'Узкая')
  expect(narrow.height).toBeLessThanOrEqual(52)
  expect(narrow.width).toBeLessThan(320)
  await expect.poll(async () => Math.round((await rect(page, 'Широкая')).left - narrow.right)).toBe(12)
  expect((await rect(page, 'Широкая')).left).toBeLessThan(wideBefore.left - 100)

  // После перезагрузки — свёрнута, и её карточки не загружаются
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))
  await page.reload()
  await expect(block(page, 'Узкая')).toContainText('Узкая· 3 карточки')
  await loaded(page, 'Широкая')
  const boardIds = await page.evaluate(async () => {
    const me = await (await fetch('/api/v1/auth/me', { headers: { Accept: 'application/json' } })).json()
    const list = await (
      await fetch('/api/v1/spaces/ROWS/boards', { headers: { Accept: 'application/json', 'X-Selen-User': me.data.id } })
    ).json()
    return Object.fromEntries(list.data.map((b: { name: string; id: string }) => [b.name, b.id]))
  })
  expect(requests).not.toContain(`/api/v1/boards/${boardIds['Узкая']}`)
  expect(requests).toContain(`/api/v1/boards/${boardIds['Широкая']}`)

  // У другого пользователя — развёрнута
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openRows(admin)
  await expect(block(admin, 'Узкая').getByRole('button', { name: 'Свернуть доску «Узкая»' })).toBeVisible()
  await admin.context().close()

  // Щелчок по шапке свёрнутой доски — развернуть
  await block(page, 'Узкая').getByRole('heading', { name: 'Узкая' }).click()
  await loaded(page, 'Узкая')
})

test('«только свои карточки»: счётчик свёрнутой доски — по своим карточкам', async ({ browser }) => {
  const page = await pageAs(browser, 'e2e-restricted@selen.test')
  await openRows(page)
  await expandAll(page)
  await block(page, 'Широкая').getByRole('button', { name: 'Свернуть доску «Широкая»' }).click()
  await expect(block(page, 'Широкая')).toContainText('Широкая· 1 карточка')
  await block(page, 'Широкая').getByRole('button', { name: 'Развернуть доску «Широкая»' }).click()
  await loaded(page, 'Широкая')
  await page.context().close()
})

test('доска из дерева: страница пространства прокручена к доске, свёрнутая — развёрнута, в дереве подсвечена', async ({ page }) => {
  await block(page, 'Высокая').getByRole('button', { name: 'Свернуть доску «Высокая»' }).click()
  await expect(block(page, 'Высокая')).toContainText('Высокая· 40 карточек')

  await openHome(page)
  await openSpaceBoard(page, 'Ряды', 'Высокая')
  await expect(page).toHaveURL(/\/spaces\/ROWS\?board=/)
  await loaded(page, 'Высокая')
  // Верх доски — у верха холста (с его отступом) и остаётся там, пока доски выше догружаются
  const canvas = await canvasRect(page)
  await expect.poll(async () => Math.abs((await rect(page, 'Высокая')).top - canvas.top - 16)).toBeLessThanOrEqual(2)
  expect((await canvasRect(page)).scrollTop).toBeGreaterThan(0)
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  await expect(tree.getByRole('link', { name: 'Высокая', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(tree.getByRole('link', { name: /^Ряды/ })).not.toHaveAttribute('aria-current')

  // Развёрнута насовсем: и без ?board — развёрнута
  await page.goto('/spaces/ROWS')
  await loaded(page, 'Высокая')
})

test('«Назад» и перезагрузка — на то же место, хотя доски выше грузятся заново и растут', async ({ page }) => {
  // «Средняя» — на 100 px ниже верха холста; «Высокая» — дальше экрана выше неё, и её заглушка намного ниже настоящей
  // доски: по пикселям прокрутки после перезагрузки у верха оказалась бы другая доска
  const place = () =>
    block(page, 'Средняя').evaluate((section) => {
      const canvas = section.closest('[data-board-canvas]')!
      canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 100
    })
  // Доски вокруг цели догружаются и меняют высоту — ставим заново, когда загрузились
  await place()
  for (const name of ['Промежуточная', 'Средняя', 'Последняя']) await loaded(page, name)
  await place()
  const offset = async () => (await rect(page, 'Средняя')).top - (await canvasRect(page)).top
  await expect.poll(async () => Math.abs((await offset()) - 100)).toBeLessThanOrEqual(2)

  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await page.getByRole('menuitem', { name: 'Профиль' }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await page.goBack()
  await loaded(page, 'Средняя')
  await expect.poll(async () => Math.abs((await offset()) - 100), { timeout: 5000 }).toBeLessThanOrEqual(2)

  // Перезагрузка — кеша досок нет: «Высокая» снова заглушка и не грузится, пока холст далеко от неё
  await page.reload()
  await loaded(page, 'Средняя')
  await expect.poll(async () => Math.abs((await offset()) - 100), { timeout: 5000 }).toBeLessThanOrEqual(2)
  await expect(block(page, 'Высокая')).toHaveAttribute('data-board-placeholder')
})

test('на вкладке «Участники» щелчок по доске в дереве открывает «Доски» и прокручивает к ней', async ({ page }) => {
  await page.getByRole('tab', { name: 'Участники' }).click()
  await expect(page.getByRole('tab', { name: 'Участники' })).toHaveAttribute('aria-selected', 'true')
  await openSpaceBoard(page, 'Ряды', 'Нижняя')
  await expect(page.getByRole('tab', { name: 'Доски' })).toHaveAttribute('aria-selected', 'true')
  await loaded(page, 'Нижняя')
  await expect(block(page, 'Нижняя')).toBeInViewport()
})

test('карточка открывается поверх пространства, закрытие — на то же место', async ({ page }) => {
  await block(page, 'Высокая').evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top + 600
  })
  await loaded(page, 'Высокая')
  const before = (await canvasRect(page)).scrollTop
  const card = block(page, 'Высокая').getByRole('button', { name: /^Открыть ROWS-\d+: Высокая карточка 12$/ })
  await card.click()

  await expect(page).toHaveURL(/\/spaces\/ROWS\/cards\/ROWS-\d+$/)
  const panel = page.getByRole('dialog', { name: 'Высокая карточка 12' })
  await expect(panel).toBeVisible()
  expect((await canvasRect(page)).scrollTop).toBe(before)

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/spaces\/ROWS$/)
  await expect(panel).toBeHidden()
  expect((await canvasRect(page)).scrollTop).toBe(before)
  await expect(card).toBeInViewport()
})

test('перенос карточки на странице пространства: автопрокрутка холста вниз и бросок в другую колонку', async ({ page }) => {
  await block(page, 'Высокая').evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top
  })
  await loaded(page, 'Высокая')
  const card = block(page, 'Высокая').getByRole('button', { name: /: Высокая карточка 2$/ })
  const from = (await card.boundingBox())!
  const target = block(page, 'Высокая').getByRole('group', { name: 'In Progress', exact: true })
  const canvasBox = (await page.locator('[data-board-canvas]').boundingBox())!
  const start = (await canvasRect(page)).scrollTop

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
  // У нижнего края окна холст едет вниз
  await page.mouse.move(from.x + from.width / 2, canvasBox.y + canvasBox.height - 5, { steps: 10 })
  await expect.poll(async () => (await canvasRect(page)).scrollTop, { timeout: 5000 }).toBeGreaterThan(start + 200)
  const over = (await target.boundingBox())!
  await page.mouse.move(over.x + over.width / 2, canvasBox.y + canvasBox.height / 2, { steps: 10 })
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  expect((await moved).ok()).toBe(true)
  await expect(target.getByRole('button', { name: /: Высокая карточка 2$/ })).toBeVisible()
})

test('узкий экран: ряды — в колонку, доска во всю ширину, холст вбок не прокручивается', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await loaded(page, 'Узкая')
  const narrow = await rect(page, 'Узкая')
  const wide = await rect(page, 'Широкая')
  const canvas = await canvasRect(page)
  expect(wide.top).toBeGreaterThan(narrow.bottom)
  expect(Math.abs(wide.left - narrow.left)).toBeLessThanOrEqual(1)
  for (const box of [narrow, wide]) {
    expect(box.left - canvas.left).toBeLessThanOrEqual(13)
    expect(canvas.right - box.right).toBeLessThanOrEqual(13)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  // Ручки ⠿ на узком экране нет и у администратора (перестановка — меню «⋯»)
  expect(await page.locator('[data-board-handle]:visible').count()).toBe(0)
})

test('полоса дорожки закреплена и на странице пространства: под заголовками колонок своей доски', async ({ page }) => {
  await openHome(page)
  await openSpaceBoard(page, 'Раскладка', 'Длинные дорожки')
  const board = block(page, 'Длинные дорожки')
  await expect(board.locator('[data-lane-row]')).toHaveCount(3)
  // Дорожки этой доски сворачивает lanes-sticky.spec — разворачиваем
  const expand = board.getByRole('button', { name: /^Развернуть дорожку/ })
  for (let left = await expand.count(); left > 0; left--) {
    await expand.first().click()
    await expect(expand).toHaveCount(left - 1)
  }
  const main = board.getByRole('region', { name: 'Основная', exact: true })
  await expect(main.locator('[data-lane-row]')).toHaveAttribute('data-lane-row', 'expanded')
  const line = () =>
    board.locator('[data-board-columns]').evaluate((columns) => columns.parentElement!.getBoundingClientRect().bottom)
  // Глубоко внутри «Основной» этой доски
  await main.evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    const columns = section.closest('[data-board-block]')!.querySelector('[data-board-columns]')!
    canvas.scrollTop += section.getBoundingClientRect().top - columns.parentElement!.getBoundingClientRect().bottom + 400
  })
  await expect.poll(async () => Math.abs((await main.locator('[data-lane-row]').boundingBox())!.y - (await line()))).toBeLessThanOrEqual(1)
  // Шапка доски — у верха холста
  const canvas = await canvasRect(page)
  expect(Math.abs((await board.locator('header').first().boundingBox())!.y - canvas.top)).toBeLessThanOrEqual(1)
})

/** Подпись элемента с фокусом (кнопка, ссылка, место доски). */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el?.getAttribute('aria-label') ?? el?.dataset.boardSlot ?? el?.tagName ?? null
  })

test('с клавиатуры: свернуть и развернуть доску — фокус остаётся на шевроне', async ({ page }) => {
  await block(page, 'Узкая').getByRole('button', { name: 'Свернуть доску «Узкая»' }).focus()
  await page.keyboard.press('Enter')
  await expect(block(page, 'Узкая')).toContainText('· 3 карточки')
  await expect.poll(() => focused(page)).toBe('Развернуть доску «Узкая»')
  await page.keyboard.press('Enter')
  await loaded(page, 'Узкая')
  await expect.poll(() => focused(page)).toBe('Свернуть доску «Узкая»')
})

test('с клавиатуры: после панели Tab ведёт в первую доску, панель вкладки — не остановка Tab', async ({ page }) => {
  await page.getByRole('button', { name: 'Архив досок' }).focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('tabpanel')
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-board-slot]'))).toBe(true)
})

test('доска из дерева получает фокус: следующий Tab — в неё, холст не прыгает к первой доске', async ({ page }) => {
  await openHome(page)
  await openSpaceBoard(page, 'Ряды', 'Нижняя')
  await loaded(page, 'Нижняя')
  await expect.poll(() => focused(page)).not.toBeNull()
  const before = (await canvasRect(page)).scrollTop
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('section[data-board-block]')?.getAttribute('aria-label'))).toBe('Нижняя')
  expect(Math.abs((await canvasRect(page)).scrollTop - before)).toBeLessThan(5)
})

test('окно карточки, открытое с клавиатуры, при закрытии возвращает фокус на карточку', async ({ page }) => {
  const card = block(page, 'Узкая').getByRole('button', { name: /^Открыть ROWS-\d+: Узкая карточка 1$/ })
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Узкая карточка 1' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Узкая карточка 1' })).toBeHidden()
  await expect(card).toBeFocused()
})

test('загрузка страницы пространства без видимых «прыжков»: ряд на экране не сдвигается, пока грузятся доски выше', async ({ page }) => {
  // С начала загрузки — каждый кадр: видимые ряды на экране и где их верх; сдвиг после первого показа — «прыжок»
  await page.addInitScript(() => {
    const first = new Map<Element, number>()
    const jumps: number[] = []
    ;(window as unknown as { __jumps: number[] }).__jumps = jumps
    const tick = () => {
      // Верх ряда — от начала содержимого холста: прокрутка (в том числе возврат на запомненное место) — не «прыжок»
      const content = document.querySelector('[data-board-canvas]')?.firstElementChild
      for (const row of document.querySelectorAll('[data-board-row]')) {
        const rect = row.getBoundingClientRect()
        const shown = getComputedStyle(row).visibility === 'visible' && rect.top < window.innerHeight
        if (!shown || !content) continue
        const top = rect.top - content.getBoundingClientRect().top
        if (!first.has(row)) first.set(row, top)
        else if (Math.abs(top - first.get(row)!) > 1) jumps.push(top - first.get(row)!)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.reload()
  await loaded(page, 'Узкая')
  await loaded(page, 'Широкая')
  await loaded(page, 'Высокая')
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as unknown as { __jumps: number[] }).__jumps)).toEqual([])
})
