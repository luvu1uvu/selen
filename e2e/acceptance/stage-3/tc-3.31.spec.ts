import { readFileSync } from 'node:fs'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { authFile, openHome } from '../../tests/helpers'
import { NOT_IN_TREE, structureRow } from './helpers'

/**
 * Данные E2eSeeder вместо демо: «E2E Пустая» / «E2E Вложенная пустая» — пустые папки (как «Новые направления» /
 * «Идеи на 2027»); «E2E Мобильные» с MOB — папка с пространством, где у e2e-owner нет роли (как «Операции»).
 * e2e-admin — администратор QA, MOB и MOVE, поэтому у него «E2E Мобильные» видна (как «Продуктовые команды»).
 *
 * Усилен по LATER-57: значки сверяются по ВСЕМ узлам «Структуры» с деревом текущего пользователя (а не по
 * нескольким названиям); подсказка проверяется как видимый текст при наведении и при фокусе с клавиатуры;
 * смена пользователя в той же вкладке — как если бы в другой вкладке того же браузера вышли и вошли Владельцем
 * (cookie сессии общие для вкладок), без перезагрузки страницы.
 */

interface TreeNode {
  id: string
  type: 'folder' | 'space'
  children?: TreeNode[]
}

interface AdminNode {
  id: string
  parent_id: string | null
  type: 'folder' | 'space'
  name: string | null
  archived_at: string | null
  space: { name: string; archived_at: string | null } | null
}

async function openStructure(page: Page) {
  await page.getByRole('link', { name: 'Структура' }).click()
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
}

/** Значок «Не видно в вашем дереве» в строке «Структуры». */
function mark(row: Locator) {
  return row.getByRole('img', { name: NOT_IN_TREE })
}

/**
 * Всплывающая подсказка видна человеку: есть элемент с ролью tooltip и текст подсказки занимает место на экране
 * (скрытый текст для скринридеров — 1 px — не считается; атрибут title — тоже).
 */
async function expectHintShown(page: Page) {
  await expect(page.getByRole('tooltip', { name: NOT_IN_TREE })).toBeAttached()
  const box = await page.getByText(NOT_IN_TREE, { exact: true }).first().boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(40)
}

async function expectHintHidden(page: Page) {
  await expect(page.getByRole('tooltip')).toHaveCount(0)
}

async function api<T>(page: Page, path: string): Promise<T> {
  // Как SPA: Referer — Sanctum считает запрос с cookie «своим» только со своего адреса; X-Selen-User — пользователь
  // вкладки, то есть тот, кто сейчас в сессии (/auth/me), — без него сервер запрос не выполнит (ADR-0002, LATER-57)
  const headers = { Accept: 'application/json', Referer: page.url() }
  const me = (await (await page.request.get('/api/v1/auth/me', { headers })).json()) as { data: { id: string } }
  const response = await page.request.get(path, {
    headers: { ...headers, 'X-Selen-User': me.data.id },
  })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: T }).data
}

/**
 * Каждый активный узел «Структуры» помечен тогда и только тогда, когда его нет в дереве того, кто сейчас вошёл
 * (GET /navigation с cookie этой вкладки). Архивные узлы не помечаются — у них «в архиве».
 */
async function expectMarksMatchTree(page: Page) {
  const [tree, all] = await Promise.all([
    api<TreeNode[]>(page, '/api/v1/navigation'),
    api<AdminNode[]>(page, '/api/v1/admin/navigation'),
  ])
  const inTree = new Set<string>()
  const walk = (nodes: TreeNode[]) =>
    nodes.forEach((node) => {
      inTree.add(node.id)
      walk(node.children ?? [])
    })
  walk(tree)

  const byId = new Map(all.map((node) => [node.id, node]))
  const insideArchived = (node: AdminNode): boolean => {
    for (let parent = node.parent_id; parent !== null; parent = byId.get(parent)?.parent_id ?? null) {
      if (byId.get(parent)?.archived_at) return true
    }
    return false
  }
  const shown = all.filter(
    (node) => !node.archived_at && !node.space?.archived_at && !insideArchived(node),
  )
  expect(shown.length).toBeGreaterThan(3)

  for (const node of shown) {
    const name = node.name ?? node.space?.name ?? ''
    const row = structureRow(page, name)
    await expect(row, name).toHaveCount(1)
    await expect(mark(row), `${name}: ${inTree.has(node.id) ? 'в дереве' : 'не в дереве'}`).toHaveCount(
      inTree.has(node.id) ? 0 : 1,
    )
  }
}

/** Cookie сессии другого пользователя — как если бы он вошёл в соседней вкладке того же браузера. */
async function switchSession(context: BrowserContext, user: 'e2e-owner@selen.test') {
  const state = JSON.parse(readFileSync(authFile(user), 'utf8')) as {
    cookies: Parameters<BrowserContext['addCookies']>[0]
  }
  await context.clearCookies()
  await context.addCookies(state.cookies)
}

test('ТК-3.31. «Структура»: пометка «Не видно в вашем дереве»; ТК-3.35. Вход другим пользователем в соседней вкладке @tc-3.31 @tc-3.35', async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFile('e2e-admin@selen.test') })
  const page = await context.newPage()
  await openHome(page)
  await page.getByRole('button', { name: 'Администрирование' }).click()

  // 1. Обычный администратор: значки ровно у узлов, которых нет в его дереве; по ТК — у пустых папок,
  //    а у папки и пространств со своим доступом — нет
  await openStructure(page)
  await expectMarksMatchTree(page)
  await expect(mark(structureRow(page, 'E2E Пустая'))).toHaveCount(1)
  await expect(mark(structureRow(page, 'E2E Вложенная пустая'))).toHaveCount(1)
  for (const name of ['E2E Мобильные', 'Мобильные приложения', 'Сквозные тесты']) {
    await expect(mark(structureRow(page, name)), name).toHaveCount(0)
  }

  // 2. Подсказка видна при наведении и при фокусе с клавиатуры
  const emptyMark = mark(structureRow(page, 'E2E Пустая'))
  await expectHintHidden(page)
  await emptyMark.hover()
  await expectHintShown(page)
  // Увести мышь плавно, как человек (один прыжок Radix считает движением к подсказке и не закрывает её)
  await page.mouse.move(0, 0, { steps: 10 })
  await expectHintHidden(page)
  await emptyMark.focus()
  await expect(emptyMark).toBeFocused()
  await expectHintShown(page)
  await page.keyboard.press('Escape')
  await expectHintHidden(page)

  // 3. В той же вкладке теперь вошёл Владелец (вышли и вошли в соседней вкладке) — переходы без перезагрузки:
  //    вкладка показывает Владельца и только его данные
  await switchSession(context, 'e2e-owner@selen.test')
  await page.getByRole('link', { name: 'Пользователи' }).click()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Меню пользователя' })).toContainText('E2E Владелец')
  await expect(page.getByRole('button', { name: 'Передать владение' })).toBeVisible()

  await openStructure(page)
  await expectMarksMatchTree(page)
  await expect(mark(structureRow(page, 'E2E Пустая'))).toHaveCount(0)
  await expect(mark(structureRow(page, 'E2E Вложенная пустая'))).toHaveCount(0)
  for (const name of ['E2E Мобильные', 'Мобильные приложения', 'Сквозные тесты']) {
    await expect(mark(structureRow(page, name)), name).toHaveCount(1)
  }

  await context.close()
})
