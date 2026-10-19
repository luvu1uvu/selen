import { expect, test, type Page } from '@playwright/test'
import { login } from '../tests/helpers'

/**
 * Замер отзывчивости доски DEV / «Продукт» (300 карточек, BoardsDemoSeeder) на production-сборке.
 * Запуск: make perf. Методика — docs/runbook.md, раздел «Производительность доски».
 *
 * Для каждого действия считаем самый долгий кадр (разрыв между requestAnimationFrame) — сколько
 * интерфейс не мог перерисоваться. Открытие доски — от клика по ссылке до кадра, в котором видны все
 * карточки (с сетью и загрузкой чанка).
 */

const RUNS = Number(process.env.PERF_RUNS ?? 5)

type Phase = 'tree' | 'open' | 'dragStart' | 'dragOver' | 'dragMove' | 'drop'

declare global {
  interface Window {
    __expectedCards: number
    __perf: {
      frames: number[]
      marks: Record<string, number>
      readyAt: number | null
      clickAt: number | null
      treeAt: number | null
    }
  }
}

/** Счётчик кадров и момент, когда на странице появились все карточки. Ставится до навигации. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const perf = {
      frames: [] as number[],
      marks: {} as Record<string, number>,
      readyAt: null as number | null,
      clickAt: null as number | null,
      treeAt: null as number | null,
    }
    window.__perf = perf
    document.addEventListener('click', (e) => (perf.clickAt ??= e.timeStamp), { capture: true })
    const tick = (t: number) => {
      perf.frames.push(t)
      // Дерево отрисовано: в нём есть пространство DEV (отсчёт — от начала загрузки страницы)
      if (perf.treeAt === null && document.querySelector('nav[aria-label="Дерево"] a[href="/spaces/DEV"]')) {
        perf.treeAt = t
      }
      if (
        perf.readyAt === null &&
        window.__expectedCards &&
        document.querySelectorAll('[aria-label^="Открыть DEV-"]').length >= window.__expectedCards
      ) {
        perf.readyAt = t
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** Сколько активных карточек на доске «Продукт» — столько должно появиться на экране. */
async function expectedCards(page: Page): Promise<number> {
  // Запрос из страницы: Sanctum узнаёт SPA по заголовку Referer
  return page.evaluate(async () => {
    const get = async (url: string) => (await fetch(url, { headers: { Accept: 'application/json' } })).json()
    const boards = await get('/api/v1/spaces/DEV/boards')
    const board = boards.data.find((b: { name: string }) => b.name === 'Продукт')
    return (await get(`/api/v1/boards/${board.id}`)).data.cards.length as number
  })
}

const mark = (page: Page, name: string) => page.evaluate((n) => (window.__perf.marks[n] = performance.now()), name)

/** Самый долгий кадр между двумя отметками. */
function longestFrame(frames: number[], from: number, to: number): number {
  let worst = 0
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from || frames[i - 1] > to) continue
    worst = Math.max(worst, frames[i] - frames[i - 1])
  }
  return Math.round(worst)
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

type Results = Record<Phase, number[]>

/** Прогоны «открыть доску → перетащить карточку» при заданном замедлении процессора. */
async function measure(page: Page, cpuSlowdown: number): Promise<Results> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })
  const results: Results = { tree: [], open: [], dragStart: [], dragOver: [], dragMove: [], drop: [] }

  for (let run = 0; run < RUNS; run++) {
    // Открытие: со страницы пространств, клик по доске в дереве
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
    await page.waitForFunction(() => window.__perf.treeAt !== null, null, { timeout: 30_000 })
    results.tree.push(await page.evaluate(() => Math.round(window.__perf.treeAt!)))
    await page.getByRole('link', { name: 'Продукт' }).first().click()
    await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 })
    results.open.push(await page.evaluate(() => Math.round(window.__perf.readyAt! - window.__perf.clickAt!)))
    await page.waitForTimeout(500)

    // Перетаскивание: первая карточка первой колонки → колонка In Progress первой дорожки
    const lane = page.locator('section').first()
    const source = lane.locator('[aria-label^="Открыть DEV-"]').first()
    const target = lane.getByRole('group').nth(2)
    await target.scrollIntoViewIfNeeded()
    await source.scrollIntoViewIfNeeded()
    const from = (await source.boundingBox())!
    const to = (await target.boundingBox())!
    const x = from.x + from.width / 2
    const y = from.y + from.height / 2

    await page.mouse.move(x, y)
    await mark(page, 'start')
    await page.mouse.down()
    await page.mouse.move(x + 10, y + 10, { steps: 3 })
    await page.waitForTimeout(500)
    await mark(page, 'over')
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 10 })
    await page.waitForTimeout(500)
    await mark(page, 'move')
    await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 10 })
    await page.waitForTimeout(500)
    await mark(page, 'drop')
    const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
    await page.mouse.up()
    await moved
    await page.waitForTimeout(800)
    await mark(page, 'end')

    const { frames, marks } = await page.evaluate(() => window.__perf)
    results.dragStart.push(longestFrame(frames, marks.start, marks.over))
    results.dragOver.push(longestFrame(frames, marks.over, marks.move))
    results.dragMove.push(longestFrame(frames, marks.move, marks.drop))
    results.drop.push(longestFrame(frames, marks.drop, marks.end))
  }

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  return results
}

const LABELS: Record<Phase, string> = {
  tree: 'Появление дерева (от начала загрузки страницы)',
  open: 'Открытие доски (от клика, с сетью и чанком)',
  dragStart: 'Начало перетаскивания (самый долгий кадр)',
  dragOver: 'Переход карточки в другую колонку',
  dragMove: 'Движение внутри колонки',
  drop: 'Отпускание и ответ сервера',
}

test('доска на 300 карточек: открытие и перетаскивание', async ({ page }) => {
  test.setTimeout(120_000 * RUNS)
  await instrument(page)
  await login(page, 'anna@selen.test')
  const cards = await expectedCards(page)
  await page.addInitScript((n: number) => (window.__expectedCards = n), cards)
  // Доска открывается из дерева: переход в пространство раскрывает путь к нему (папка «Продуктовые команды» и
  // пространство DEV), раскрытое запоминается в браузере — дальше ссылка на доску видна сразу на «/»
  await page.goto('/spaces/DEV')
  await expect(page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: 'Продукт' })).toBeVisible()

  // Обычная скорость и замедление процессора ×4 (слабый офисный ноутбук) — на нём разница заметнее
  for (const slowdown of [1, 4]) {
    const results = await measure(page, slowdown)
    console.log(`\nДоска DEV / «Продукт», ${cards} карточек, CPU ×${slowdown}, прогонов: ${RUNS}. Медиана (все значения), мс:`)
    for (const phase of Object.keys(LABELS) as Phase[]) {
      const values = results[phase]
      console.log(`  ${LABELS[phase].padEnd(46)} ${String(median(values)).padStart(5)}   (${values.join(', ')})`)
    }
  }
})
