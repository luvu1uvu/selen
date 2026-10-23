import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome, pageAs } from './helpers'

/**
 * Дорожки внутри доски и их личное сворачивание (LATER-55, ADR-0019). «Доска с дорожками» пространства «Раскладка»
 * (E2eSeeder): шаблон «Разработка» (шире окна), дорожки «Основная» (3 карточки в To Do), «Срочные» (2 в To Do,
 * 1 в In Progress), «Плановые» (1 в Backlog). Сворачивание хранится на сервере — перед каждым тестом все дорожки
 * разворачиваются (упавший посреди тест не оставляет их свёрнутыми следующим).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const BOARD = 'Доска с дорожками'

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Раскладка', BOARD)
  await expect(page.locator('[data-lane-row]')).toHaveCount(3)
  // По одной: каждый раз первая из оставшихся, следующая — когда эта развернулась (иначе щелчок попал бы в неё же)
  const expand = page.getByRole('button', { name: /^Развернуть дорожку/ })
  for (let left = await expand.count(); left > 0; left--) {
    await expand.first().click()
    await expect(expand).toHaveCount(left - 1)
  }
})

const center = (box: { x: number; y: number; width: number; height: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/** Плавное движение мыши с зажатой кнопкой — так dnd-kit видит перенос, как от человека. */
async function glide(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 15) {
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps)
  }
}

const lane = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const toggle = (page: Page, name: string, action: 'Свернуть' | 'Развернуть') =>
  lane(page, name).getByRole('button', { name: `${action} дорожку «${name}»` })
const cell = (page: Page, name: string) => page.getByRole('group', { name, exact: true })
/** Счётчик в заголовке колонки (колонки шаблона «Разработка» — по порядку). */
const columnCount = (page: Page, column: string) =>
  page.locator('[data-board-columns]').getByTitle(/карт\./).nth(['Backlog', 'To Do', 'In Progress'].indexOf(column))

test('свёрнутая дорожка — строка с названием и счётчиком; после перезагрузки свёрнута, у другого — развёрнута', async ({ page, browser }) => {
  const toDoCount = await columnCount(page, 'To Do').textContent()
  await expect(lane(page, 'Срочные')).toContainText('3 карточки')

  await toggle(page, 'Срочные', 'Свернуть').click()
  await expect(cell(page, 'To Do / Срочные')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Дорожная срочная 1$/ })).toHaveCount(0)
  await expect(lane(page, 'Срочные')).toContainText('3 карточки')
  // Счётчики колонок — по всем дорожкам, сворачивание их не меняет
  await expect(columnCount(page, 'To Do')).toHaveText(toDoCount!)

  await page.reload()
  await expect(toggle(page, 'Срочные', 'Развернуть')).toHaveAttribute('aria-expanded', 'false')
  await expect(cell(page, 'To Do / Срочные')).toHaveCount(0)
  await expect(cell(page, 'To Do / Основная')).toBeVisible()

  // Сворачивание личное: у администратора пространства дорожка развёрнута
  const admin = await pageAs(browser, 'e2e-admin@selen.test')
  await openBoard(admin, 'Раскладка', BOARD)
  await expect(cell(admin, 'To Do / Срочные')).toBeVisible()
  await admin.context().close()

  // Щелчок по строке свёрнутой дорожки разворачивает её
  await lane(page, 'Срочные').getByText('Срочные', { exact: true }).click()
  await expect(cell(page, 'To Do / Срочные')).toBeVisible()
  await expect(toggle(page, 'Срочные', 'Свернуть')).toHaveAttribute('aria-expanded', 'true')
  await page.reload()
  await expect(cell(page, 'To Do / Срочные')).toBeVisible()
})

test('свёрнутая дорожка не принимает перенос: карточка, отпущенная над её строкой, остаётся на месте', async ({ page }) => {
  await toggle(page, 'Плановые', 'Свернуть').click()
  await expect(cell(page, 'Backlog / Плановые')).toHaveCount(0)

  const card = cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })
  const from = (await card.boundingBox())!
  const row = (await lane(page, 'Плановые').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // Через ячейки «Срочных» — к строке свёрнутых «Плановых»
  for (let step = 1; step <= 20; step++) {
    const t = step / 20
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + (row.y + row.height / 2 - from.y - from.height / 2) * t,
    )
  }
  // Над строкой свёрнутой дорожки карточка показана на своём месте
  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toHaveCount(1)
  await page.mouse.up()

  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toBeVisible()
  await expect(lane(page, 'Плановые')).toContainText('1 карточка')
  await page.reload()
  await expect(cell(page, 'To Do / Основная').getByRole('button', { name: /Дорожная основная 1$/ })).toBeVisible()

  await toggle(page, 'Плановые', 'Развернуть').click()
  await expect(cell(page, 'Backlog / Плановые')).toBeVisible()
})

test('«+» в заголовке колонки открывает форму в первой развёрнутой дорожке', async ({ page }) => {
  await toggle(page, 'Основная', 'Свернуть').click()
  await expect(cell(page, 'To Do / Основная')).toHaveCount(0)

  await page.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
  const form = cell(page, 'To Do / Срочные')
  await expect(form.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })).toBeFocused()
  await expect(form.locator('[data-slot="lane-value"]')).toHaveText('Срочные')
  await page.keyboard.press('Escape')

  await toggle(page, 'Основная', 'Развернуть').click()
  await expect(cell(page, 'To Do / Основная')).toBeVisible()
})

test('выбор дорожки в форме новой карточки — своя рамка фокуса с клавиатуры', async ({ page }) => {
  // U-3 UX-ревью LATER-91: у всей формы рамка одна и для поля, и для выбора; у строки выбора был только фон 1,05:1
  await page.getByRole('button', { name: 'Добавить карточку в начало To Do' }).click()
  const form = cell(page, 'To Do / Основная')
  await expect(form.getByRole('textbox', { name: 'Добавить карточку в начало To Do' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(form.getByRole('combobox', { name: 'Дорожка' })).toBeFocused()
  const row = form.locator('[data-slot="lane-value"]').locator('..')
  // Цвет — ring (#737373, oklch 0.556), рамка 2 px внутри строки
  await expect(row).toHaveCSS('box-shadow', /(oklch\(0\.556 0 0\)|rgb\(115, 115, 115\)) 0px 0px 0px 2px inset/)
  await page.keyboard.press('Escape')
})

test('название дорожки слева и счётчик с шевроном справа видны при прокрутке доски вбок', async ({ page }) => {
  const block = (await page.locator(`section[aria-label="${BOARD}"]`).boundingBox())!
  const name = lane(page, 'Срочные').getByText('Срочные', { exact: true })
  const chevron = toggle(page, 'Срочные', 'Свернуть')
  const inside = async () => {
    const n = (await name.boundingBox())!
    const c = (await chevron.boundingBox())!
    expect(n.x).toBeGreaterThanOrEqual(block.x)
    expect(n.x).toBeLessThan(block.x + 40)
    expect(c.x + c.width).toBeLessThanOrEqual(block.x + block.width)
    expect(c.x + c.width).toBeGreaterThan(block.x + block.width - 40)
  }

  await inside()
  const overflow = await page.locator('[data-board-body]').evaluate((body) => {
    body.scrollLeft = body.scrollWidth
    return body.scrollWidth - body.clientWidth
  })
  expect(overflow).toBeGreaterThan(200)
  await inside()
})

/**
 * Регрессия ревью PR 2: перенос вбок по своей дорожке сжимает её (To Do была самой высокой колонкой), строка свёрнутой
 * дорожки ниже поднимается. Над строкой карточка возвращается на своё место — дорожка снова растёт и уводит строку
 * из-под указателя. Цель не должна зависеть от этого сдвига: иначе карточка металась между «местом» и In Progress
 * каждый кадр, даже при неподвижной мыши (ловушка dnd-kit, CLAUDE.md).
 */
test('над свёрнутой дорожкой место карточки не мечется, когда её дорожка выше сжалась от переноса', async ({ page }) => {
  await toggle(page, 'Срочные', 'Свернуть').click()
  const origin = cell(page, 'To Do / Основная')
  const progress = cell(page, 'In Progress / Основная')
  const card = (where: typeof origin) => where.getByRole('button', { name: /Дорожная основная 1$/ })

  const start = center((await card(origin).boundingBox())!)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const right = { x: center((await progress.boundingBox())!).x, y: start.y }
  await glide(page, start, right)
  await expect(card(progress)).toHaveCount(1)

  // Строка «Срочные» поднялась вместе с дорожкой — указатель на неё и задержать
  const row = center((await lane(page, 'Срочные').boundingBox())!)
  await glide(page, right, { x: right.x, y: row.y })
  for (let sample = 0; sample < 8; sample++) {
    await page.waitForTimeout(80)
    expect(await card(origin).count(), `замер ${sample}`).toBe(1)
    expect(await card(progress).count(), `замер ${sample}`).toBe(0)
  }

  await page.mouse.up()
  await expect(card(origin)).toBeVisible()
  await page.reload()
  await expect(card(origin)).toBeVisible()
})

test('свёрнуты все дорожки широкой доски — доска всё равно прокручивается вбок до последней колонки', async ({ page }) => {
  for (const name of ['Основная', 'Срочные', 'Плановые']) await toggle(page, name, 'Свернуть').click()
  await expect(page.locator('[data-board-body] [role="group"]')).toHaveCount(0)

  const overflow = await page.locator('[data-board-body]').evaluate((body) => {
    body.scrollLeft = body.scrollWidth
    return body.scrollWidth - body.clientWidth
  })
  expect(overflow).toBeGreaterThan(200)
  await expect(page.getByRole('button', { name: 'Добавить карточку в начало Done' })).toBeInViewport()
})

/**
 * LATER-70 (замечание PM к PR 2): свёрнуты все дорожки — блок доски кончается последней полосой дорожки: ни минимальной
 * высоты (15rem), ни нижнего отступа или полоски прокрутки вбок под ней. «Доска с дорожками» шире окна — у развёрнутой
 * под дорожками была бы полоса прокрутки вбок.
 */
test('свёрнуты все дорожки — блок доски кончается последней полосой, без пустоты и полоски под ней (LATER-70)', async ({ page }) => {
  for (const name of ['Основная', 'Срочные', 'Плановые']) await toggle(page, name, 'Свернуть').click()
  await expect(page.locator('[data-board-body] [role="group"]')).toHaveCount(0)

  const m = await page.locator(`section[aria-label="${BOARD}"]`).evaluate((block) => {
    const height = (el: Element | null) => (el ? el.getBoundingClientRect().height : 0)
    const style = getComputedStyle(block)
    const bands = [...block.querySelectorAll('[data-lane-row]')]
    return {
      block: height(block),
      parts:
        height(block.querySelector('header')) +
        height(block.querySelector('[data-board-columns]')!.parentElement) +
        bands.reduce((sum, band) => sum + height(band), 0) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth),
      // Низ блока (без нижней границы) — низ последней полосы
      gapBelow:
        block.getBoundingClientRect().bottom - parseFloat(style.borderBottomWidth) - bands.at(-1)!.getBoundingClientRect().bottom,
    }
  })
  expect(Math.abs(m.gapBelow), JSON.stringify(m)).toBeLessThanOrEqual(1)
  expect(Math.abs(m.block - m.parts), JSON.stringify(m)).toBeLessThanOrEqual(1)

  // Развернули одну — под дорожками снова полоса прокрутки вбок (доска шире окна), как раньше
  await toggle(page, 'Плановые', 'Развернуть').click()
  await expect(page.locator('[data-board-scrollbar]')).toBeVisible()
})

/**
 * LATER-70, общее правило (PM 20.10): под свёрнутой ПОСЛЕДНЕЙ дорожкой — ни пустоты, ни отступа, даже если верхние
 * развёрнуты. Полоса прокрутки вбок (LATER-4) у широкой доски остаётся — над свёрнутыми дорожками в конце, под ячейками.
 */
test('свёрнута только последняя дорожка — блок кончается её полосой, полоса прокрутки вбок — над ней (LATER-70)', async ({ page }) => {
  await toggle(page, 'Плановые', 'Свернуть').click()
  await expect(page.getByRole('group', { name: 'Backlog / Плановые', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'To Do / Основная', exact: true })).toBeVisible()

  const m = await page.locator(`section[aria-label="${BOARD}"]`).evaluate((block) => {
    const style = getComputedStyle(block)
    const last = [...block.querySelectorAll('[data-lane-row]')].at(-1)!.getBoundingClientRect()
    const bar = block.querySelector('[data-board-scrollbar]')!.getBoundingClientRect()
    return {
      gapBelow: block.getBoundingClientRect().bottom - parseFloat(style.borderBottomWidth) - last.bottom,
      barHeight: bar.height,
      barBottomToBand: last.top - bar.bottom,
    }
  })
  expect(Math.abs(m.gapBelow), JSON.stringify(m)).toBeLessThanOrEqual(1)
  // Доска шире окна — полоса прокрутки вбок есть, и она выше свёрнутой полосы
  expect(m.barHeight, JSON.stringify(m)).toBeGreaterThan(0)
  expect(m.barBottomToBand, JSON.stringify(m)).toBeGreaterThanOrEqual(-1)
})

test('щелчок мышью по стрелке дорожки — без рамки фокуса и без прокрутки доски вбок; с клавиатуры рамка есть', async ({ page }) => {
  const body = page.locator('[data-board-body]')
  await body.evaluate((b) => (b.scrollLeft = 0))
  const chevron = toggle(page, 'Срочные', 'Свернуть')
  const at = (await chevron.boundingBox())!
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
  const collapsed = toggle(page, 'Срочные', 'Развернуть')
  await expect(collapsed).toBeVisible()
  expect(await collapsed.evaluate((el) => el.matches(':focus-visible'))).toBe(false)
  await expect(collapsed).toHaveCSS('box-shadow', 'none')
  expect(await body.evaluate((b) => b.scrollLeft)).toBe(0)

  // С клавиатуры: фокус на стрелку — рамка видна
  await collapsed.focus()
  await page.keyboard.press('Enter')
  const expanded = toggle(page, 'Срочные', 'Свернуть')
  await expect(expanded).toBeFocused()
  expect(await expanded.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  await expect(expanded).not.toHaveCSS('box-shadow', 'none')
})
