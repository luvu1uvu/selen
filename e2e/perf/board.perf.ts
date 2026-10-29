import { expect, test, type Page } from '@playwright/test'
import { login } from '../tests/helpers'
import { instrument, longestFrame, mark, median } from './frames'

/**
 * Замер отзывчивости доски DEV / «Продукт» (300 карточек, BoardsDemoSeeder) на production-сборке — её отдельной
 * страницей (/boards/ID). Запуск: make perf. Методика — docs/runbook.md, раздел «Производительность доски».
 *
 * Для каждого действия считаем самый долгий кадр (разрыв между requestAnimationFrame) — сколько
 * интерфейс не мог перерисоваться. Открытие доски — от перехода до кадра, в котором видны все карточки (с сетью и
 * загрузкой чанка). Ссылка доски в дереве с PR 3 пакета «Раскладка» ведёт на страницу пространства (ADR-0019) — её
 * замер в space.perf.ts; здесь, как до неё, — переход на страницу одной доски внутри приложения.
 */

const RUNS = Number(process.env.PERF_RUNS ?? 5)

type Phase = 'tree' | 'open' | 'dragStart' | 'dragOver' | 'dragMove' | 'drop'

/** Активные карточки доски «Продукт» и её id — столько карточек должно появиться на экране. */
async function productBoard(page: Page): Promise<{ id: string; cards: number }> {
  // Запрос из страницы: Sanctum узнаёт SPA по заголовку Referer; X-Selen-User — пользователь вкладки, без него
  // сервер запрос не выполнит (ADR-0002, LATER-57)
  return page.evaluate(async () => {
    const json = async (url: string, headers: Record<string, string>) =>
      (await fetch(url, { headers: { Accept: 'application/json', ...headers } })).json()
    const me = await json('/api/v1/auth/me', {})
    const get = (url: string) => json(url, { 'X-Selen-User': me.data.id })
    const boards = await get('/api/v1/spaces/DEV/boards')
    const board = boards.data.find((b: { name: string }) => b.name === 'Продукт')
    return { id: board.id as string, cards: (await get(`/api/v1/boards/${board.id}`)).data.cards.length as number }
  })
}

type Results = Record<Phase, number[]>

/** Прогоны «открыть доску → перетащить карточку» при заданном замедлении процессора. */
async function measure(page: Page, boardId: string, cpuSlowdown: number): Promise<Results> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuSlowdown })
  const results: Results = { tree: [], open: [], dragStart: [], dragOver: [], dragMove: [], drop: [] }

  for (let run = 0; run < RUNS; run++) {
    // Открытие: со страницы пространств переход на страницу доски внутри приложения — как раньше по ссылке дерева
    // (history.pushState и popstate: так React Router переходит по «Назад» и «Вперёд»)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
    await page.waitForFunction(() => window.__perf.treeAt !== null, null, { timeout: 30_000 })
    results.tree.push(await page.evaluate(() => Math.round(window.__perf.treeAt!)))
    await page.evaluate((id) => {
      window.__perf.clickAt = performance.now()
      history.pushState(null, '', `/boards/${id}`)
      dispatchEvent(new PopStateEvent('popstate'))
    }, boardId)
    await page.waitForFunction(() => window.__perf.readyAt !== null, null, { timeout: 30_000 })
    results.open.push(await page.evaluate(() => Math.round(window.__perf.readyAt! - window.__perf.clickAt!)))
    await page.waitForTimeout(500)

    // Перетаскивание: первая карточка первой колонки → колонка In Progress первой дорожки
    // Дорожка — по data-lane-section: первый <section> страницы — уже не дорожка (дерево и блок доски тоже section)
    const lane = page.locator('[data-lane-section]').first()
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
  open: 'Открытие доски (от перехода, с сетью и чанком)',
  dragStart: 'Начало перетаскивания (самый долгий кадр)',
  dragOver: 'Переход карточки в другую колонку',
  dragMove: 'Движение внутри колонки',
  drop: 'Отпускание и ответ сервера',
}

test('доска на 300 карточек: открытие и перетаскивание', async ({ page }) => {
  test.setTimeout(120_000 * RUNS)
  await instrument(page, { treeLink: '/spaces/DEV', cardPrefix: 'Открыть DEV-' })
  await login(page, 'anna@selen.test')
  const { id, cards } = await productBoard(page)
  await page.addInitScript((n: number) => (window.__expectedCards = n), cards)
  // Переход в пространство раскрывает путь к нему в дереве (папка «Продуктовые команды»), раскрытое запоминается в
  // браузере — «дерево отрисовано» на «/» отсчитывается по ссылке DEV
  await page.goto('/spaces/DEV')
  await expect(page.getByRole('navigation', { name: 'Дерево' }).getByRole('link', { name: 'Продукт' })).toBeVisible()

  // Обычная скорость и замедление процессора ×4 (слабый офисный ноутбук) — на нём разница заметнее
  for (const slowdown of [1, 4]) {
    const results = await measure(page, id, slowdown)
    console.log(`\nДоска DEV / «Продукт», ${cards} карточек, CPU ×${slowdown}, прогонов: ${RUNS}. Медиана (все значения), мс:`)
    for (const phase of Object.keys(LABELS) as Phase[]) {
      const values = results[phase]
      console.log(`  ${LABELS[phase].padEnd(46)} ${String(median(values)).padStart(5)}   (${values.join(', ')})`)
    }
  }
})
