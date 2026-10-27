import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { DARK, LIGHT, expectShownTheme, focusRing, outlineOf, ringClipping } from './helpers'

/**
 * ТК-RD2.7. Рамка фокуса с клавиатуры — цветом акцента (светлая — индиго, тёмная — светло-сиреневая), 2 px с зазором
 * 2 px; у карточки — вокруг всей карточки, у строки дерева верх не обрезан, у главной кнопки — зазор; от щелчка мышью
 * рамки нет. Анна → e2e-admin (светлая, THEME «Тёмная тема» / «Вид») и e2e-dark (тёмная, DARK «Тёмная проверка» / «Вид»).
 * Шаги 1–2 — одним проходом Tab по странице пространства (доска из дерева открывается на ней, на её панели — «Создать
 * доску»): полоса разделов → дерево → панель пространства → шапка доски → «+» и «⋯» колонок → карточки.
 */

type Target = 'rail' | 'firstRow' | 'selectedRow' | 'create' | 'boardMenu' | 'addCard' | 'columnMenu' | 'card'

const TARGETS: Record<Target, string> = {
  rail: 'раздел полосы «Дерево»',
  firstRow: 'первая строка дерева',
  selectedRow: 'строка доски в дереве',
  create: 'главная кнопка «Создать доску»',
  boardMenu: '«⋯» шапки доски',
  addCard: '«+» колонки To Do',
  columnMenu: '«⋯» колонки To Do',
  card: 'карточка',
}

/** Что сейчас в фокусе — признаки для сопоставления с целями. */
function focused(page: Page, board: string) {
  return page.evaluate((board) => {
    const e = document.activeElement
    if (!e || e === document.body) return null
    const tree = document.querySelector('nav[aria-label="Дерево"]')
    const label = e.getAttribute('aria-label') ?? ''
    const matches: Record<string, boolean> = {
      rail: !!e.closest('nav[aria-label="Разделы"]') && label === 'Дерево' && e.getAttribute('aria-pressed') === 'true',
      firstRow: e === tree?.querySelector('li a, li button'),
      selectedRow: !!tree?.contains(e) && e.getAttribute('aria-current') === 'page',
      create: (e.textContent ?? '').trim() === 'Создать доску',
      boardMenu: label === `Действия с доской «${board}»`,
      addCard: label === 'Добавить карточку в начало To Do',
      columnMenu: label === 'Действия с колонкой «To Do»',
      card: e.hasAttribute('data-card-tile'),
    }
    return Object.keys(matches).filter((key) => matches[key])
  }, board)
}

async function checkFocusRings(page: Page, space: string, board: string, theme: 'light' | 'dark') {
  await openHome(page)
  await openSpaceBoard(page, space, board)
  await expectShownTheme(page, theme)
  const region = page.getByRole('region', { name: board })
  await expect(region.locator('[data-card-tile]').first()).toBeVisible()

  // 1–2. Tab с начала страницы (первая ссылка полосы — «Главная»), пока не пройдены все цели (не больше 400 нажатий)
  await page.getByRole('link', { name: 'Главная' }).focus()
  const seen = new Map<Target, { outline: Awaited<ReturnType<typeof outlineOf>>; clipped: string[]; enclosed?: boolean }>()
  for (let step = 0; step < 400 && seen.size < Object.keys(TARGETS).length; step++) {
    await page.keyboard.press('Tab')
    const hits = ((await focused(page, board)) ?? []).filter((key) => !seen.has(key as Target)) as Target[]
    if (!hits.length) continue
    const current = page.locator(':focus')
    const outline = await outlineOf(current)
    const clipped = await ringClipping(current)
    // У карточки рамка — на плитке, а плитка совпадает с карточкой: рамка вокруг всей карточки
    const enclosed = hits.includes('card')
      ? await current.evaluate((tile) => {
          const [a, b] = [tile.getBoundingClientRect(), tile.firstElementChild!.getBoundingClientRect()]
          return [a.left - b.left, a.top - b.top, a.right - b.right, a.bottom - b.bottom].every((d) => Math.abs(d) <= 0.5)
        })
      : undefined
    for (const hit of hits) seen.set(hit, { outline, clipped, enclosed })
  }
  for (const [target, what] of Object.entries(TARGETS) as [Target, string][]) {
    const result = seen.get(target)
    expect(result, `Tab дошёл до цели: ${what}`).toBeDefined()
    expect(result!.outline, `${what}: рамка цветом акцента 2 px с зазором 2 px`).toEqual(focusRing(theme))
    expect(result!.clipped, `${what}: рамка не обрезана`).toEqual([])
  }
  expect(seen.get('card')!.enclosed, 'рамка — вокруг всей карточки').toBe(true)

  // 3. Щелчок мышью по «⋯» колонки — рамки нет; Esc закрывает меню; щелчок по пустому месту доски — рамки нет нигде
  await region.getByRole('button', { name: 'Действия с колонкой «To Do»' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  // Открытое меню прячет остальную страницу от скринридеров (aria-hidden) — кнопку ищем не по роли
  const opened = page.locator('[aria-label="Действия с колонкой «To Do»"][aria-expanded="true"]')
  expect((await outlineOf(opened)).style, 'от щелчка мышью рамки нет').toBe('none')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  const empty = await region.evaluate((root) => {
    const box = root.getBoundingClientRect()
    for (let y = box.top + 200; y < Math.min(box.bottom, window.innerHeight) - 8; y += 16) {
      for (let x = box.left + 16; x < Math.min(box.right, window.innerWidth) - 8; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit && root.contains(hit) && !hit.closest('[data-card-tile], button, a, input, textarea, [role="button"]'))
          return { x, y }
      }
    }
    return null
  })
  expect(empty, 'на доске есть пустое место').not.toBeNull()
  await page.mouse.click(empty!.x, empty!.y)
  await expect(menu).toBeHidden()
  expect(
    await page.evaluate(() => [...document.querySelectorAll(':focus-visible')].map((e) => e.outerHTML.slice(0, 80))),
    'после щелчка мышью рамки фокуса нет',
  ).toEqual([])
}

// Проход Tab по дереву и доске — до нескольких сотен нажатий
test.describe.configure({ timeout: 90_000 })

test.describe('светлая тема', () => {
  test.use({ storageState: authFile(LIGHT.user) })

  test('ТК-RD2.7. Рамка фокуса с клавиатуры — светлая тема @tc-RD2.7', async ({ page }) => {
    await checkFocusRings(page, LIGHT.space, LIGHT.board, 'light')
  })
})

test.describe('тёмная тема', () => {
  test.use({ storageState: authFile(DARK.user) })

  test('ТК-RD2.7. Рамка фокуса с клавиатуры — тёмная тема @tc-RD2.7', async ({ page }) => {
    await checkFocusRings(page, DARK.space, DARK.board, 'dark')
  })
})
