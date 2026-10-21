import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from '../tests/helpers'
import { instrument, longestFrame, mark, median, resetOpen } from './frames'

/**
 * Замер страницы пространства с досками рядами (LATER-55, PR 3 пакета «Раскладка», ADR-0019; журнал пакета, раздел 5)
 * на production-сборке. Пространство PERF (PerfSpaceSeeder): 5 досок по 200 карточек, ряды [«Узкая», «Широкая 1»],
 * [«Широкая 2»], [«Средняя 1», «Средняя 2» (у anna свёрнута)]. Запуск: make perf.
 *
 * - Открытие пространства из дерева — от щелчка до кадра, где видны все карточки досок первого экрана (первый ряд;
 *   остальные грузятся, когда подходят к экрану).
 * - Перетаскивание на первой доске и на дальней (после прокрутки к третьему ряду) — самые долгие кадры, как в замере
 *   одной доски.
 * - Свернуть и развернуть доску — самый долгий кадр.
 * - Свёрнутая доска — ни одного запроса её карточек.
 * - Для сравнения — открытие одной доски первого ряда («Широкая 1», 200 карточек) её страницей (/boards/ID), переходом
 *   внутри приложения: так открывалась доска до страницы пространства («до» плана пакета).
 */

const RUNS = Number(process.env.PERF_RUNS ?? 5)

type Phase = 'single' | 'open' | 'dragFirst' | 'dragFar' | 'collapse' | 'expand'

const LABELS: Record<Phase, string> = {
  single: '«Широкая 1» (200 карточек) своей страницей — для сравнения',
  open: 'Открытие пространства (от клика, первый ряд досок)',
  dragFirst: 'Перетаскивание на первой доске (самый долгий кадр)',
  dragFar: 'Перетаскивание на дальней доске (самый долгий кадр)',
  collapse: 'Свернуть доску (самый долгий кадр)',
  expand: 'Развернуть доску (самый долгий кадр, с загрузкой)',
}

interface Summary {
  id: string
  name: string
  row_id: string
  cards_count: number
  collapsed: boolean
}

function spaceBoards(page: Page): Promise<Summary[]> {
  return page.evaluate(async () => {
    const json = async (url: string, headers: Record<string, string>) =>
      (await fetch(url, { headers: { Accept: 'application/json', ...headers } })).json()
    const me = await json('/api/v1/auth/me', {})
    return (await json('/api/v1/spaces/PERF/boards', { 'X-Selen-User': me.data.id })).data
  })
}

const block = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

/** Прокрутить холст так, чтобы верх доски был у верха холста. */
async function scrollTo(page: Page, name: string) {
  await block(page, name).evaluate((section) => {
    const canvas = section.closest('[data-board-canvas]')!
    canvas.scrollTop += section.getBoundingClientRect().top - canvas.getBoundingClientRect().top
  })
}

/** Перенос первой карточки колонки from в колонку to той же доски; самый долгий кадр от взятия до ответа сервера. */
async function drag(page: Page, board: Locator, from: string, to: string): Promise<number> {
  await expect(board.locator('[data-board-body]')).toBeVisible()
  const source = board.getByRole('group', { name: from, exact: true }).getByRole('button').first()
  const target = board.getByRole('group', { name: to, exact: true })
  const a = (await source.boundingBox())!
  const b = (await target.boundingBox())!
  const x = a.x + a.width / 2
  const y = a.y + a.height / 2
  await page.mouse.move(x, y)
  await mark(page, 'dragStart')
  await page.mouse.down()
  await page.mouse.move(x + 10, y + 10, { steps: 3 })
  await page.waitForTimeout(300)
  await page.mouse.move(b.x + b.width / 2, y + 40, { steps: 10 })
  await page.waitForTimeout(300)
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  await moved
  await page.waitForTimeout(500)
  await mark(page, 'dragEnd')
  const { frames, marks } = await page.evaluate(() => window.__perf)
  return longestFrame(frames, marks.dragStart, marks.dragEnd)
}

test('пространство: 5 досок по 200 карточек — открытие, перетаскивание, сворачивание', async ({ page }) => {
  test.setTimeout(120_000 * RUNS)
  await instrument(page, { treeLink: '/spaces/PERF', cardPrefix: 'Открыть PERF-' })
  await login(page, 'anna@selen.test')
  const boards = await spaceBoards(page)
  const firstRow = boards.filter((board) => board.row_id === boards[0].row_id)
  const expected = firstRow.reduce((sum, board) => sum + board.cards_count, 0)
  const collapsed = boards.filter((board) => board.collapsed)
  expect(collapsed.map((board) => board.name)).toEqual(['Средняя 2'])
  await page.addInitScript((n: number) => (window.__expectedCards = n), expected)
  const requested: string[] = []
  page.on('request', (request) => requested.push(new URL(request.url()).pathname))

  for (const slowdown of [1, 4]) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: slowdown })
    const results: Record<Phase, number[]> = { single: [], open: [], dragFirst: [], dragFar: [], collapse: [], expand: [] }
    const wide = boards.find((board) => board.name === 'Широкая 1')!

    for (let run = 0; run < RUNS; run++) {
      // Для сравнения: та же доска своей страницей
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
      await page.evaluate(
        ({ id, cards }) => {
          window.__expectedCards = cards
          window.__perf.readyAt = null
          window.__perf.clickAt = performance.now()
          history.pushState(null, '', `/boards/${id}`)
          dispatchEvent(new PopStateEvent('popstate'))
        },
        { id: wide.id, cards: wide.cards_count },
      )
      await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 })
      results.single.push(await page.evaluate(() => Math.round(window.__perf.readyAt! - window.__perf.clickAt!)))

      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
      await page.waitForFunction(() => window.__perf.treeAt !== null, null, { timeout: 30_000 })
      await resetOpen(page)
      await page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: /Производительность/ }).click()
      await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 })
      results.open.push(await page.evaluate(() => Math.round(window.__perf.readyAt! - window.__perf.clickAt!)))
      await page.waitForTimeout(500)

      results.dragFirst.push(await drag(page, block(page, 'Узкая'), 'В работе', 'Готово'))

      await scrollTo(page, 'Средняя 1')
      await page.waitForTimeout(300)
      results.dragFar.push(await drag(page, block(page, 'Средняя 1'), 'To Do', 'In Progress'))

      await scrollTo(page, 'Широкая 2')
      await expect(block(page, 'Широкая 2').locator('[data-board-body]')).toBeVisible()
      await mark(page, 'collapse')
      await block(page, 'Широкая 2').getByRole('button', { name: 'Свернуть доску «Широкая 2»' }).click()
      await expect(block(page, 'Широкая 2').getByRole('button', { name: 'Развернуть доску «Широкая 2»' })).toBeVisible()
      await page.waitForTimeout(500)
      await mark(page, 'expand')
      await block(page, 'Широкая 2').getByRole('button', { name: 'Развернуть доску «Широкая 2»' }).click()
      await expect(block(page, 'Широкая 2').locator('[data-board-body]')).toBeVisible()
      await page.waitForTimeout(500)
      await mark(page, 'end')
      const { frames, marks } = await page.evaluate(() => window.__perf)
      results.collapse.push(longestFrame(frames, marks.collapse, marks.expand))
      results.expand.push(longestFrame(frames, marks.expand, marks.end))
    }

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    console.log(
      `\nПространство PERF: 5 досок по 200 карточек, первый ряд — ${expected} карточек, CPU ×${slowdown}, прогонов: ${RUNS}. Медиана (все значения), мс:`,
    )
    for (const phase of Object.keys(LABELS) as Phase[]) {
      const values = results[phase]
      console.log(`  ${LABELS[phase].padEnd(50)} ${String(median(values)).padStart(5)}   (${values.join(', ')})`)
    }
  }

  // Свёрнутая доска не загружала карточки ни разу
  for (const board of collapsed) expect(requested).not.toContain(`/api/v1/boards/${board.id}`)
  console.log(`  Запросов карточек свёрнутой доски: 0 (${collapsed.map((board) => board.name).join(', ')})`)
})
