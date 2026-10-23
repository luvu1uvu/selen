import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import { column, drag, READ, ROLES } from './helpers'

/**
 * ТК-R2.1: участники пространств перенесены на новые роли — редактор по-прежнему переносит и меняет карточки, а доску
 * не меняет; комментатор не переносит и не правит карточки, но комментирует. «Разработка» → «Продукт»: Борис
 * (редактор) — e2e-editor в RROLES «Права: роли» (карточка RROLES-1 «Переносит редактор»), Вера (комментатор) —
 * e2e-editor в RREAD «Права: чтение», доска «Обсуждение» (RREAD-1 «Для комментария»), E2eSeeder::rights2.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-R2.1. Редактор и комментатор работают как раньше @tc-R2.1', async ({ page }) => {
  // 1–2. Редактор: «Продукт» — перенести карточку из первой колонки во вторую
  await openHome(page)
  await openBoard(page, ROLES, 'Продукт')
  const card = page.getByRole('button', { name: /^Открыть RROLES-1: / })
  await expect(column(page, 'To Do').locator(card)).toBeVisible()
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await drag(page, card, column(page, 'In Progress'))
  expect((await moved).status()).toBe(200)
  await expect(column(page, 'In Progress').locator(card)).toBeVisible()

  // Открыть карточку, изменить название, закрыть
  await card.click()
  const window = page.getByRole('dialog')
  // Редактор может ставить «Срочно» — для сравнения с комментатором ниже
  await expect(window.getByRole('checkbox', { name: 'Срочно' })).toBeEnabled()
  const title = window.getByRole('textbox', { name: 'Название' })
  await title.fill('Перенесена редактором')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Сохранено')).toBeVisible()
  await window.getByRole('button', { name: 'Закрыть', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Карточка в новой колонке и после обновления страницы, новое название сохранилось
  await page.reload()
  const renamed = page.getByRole('button', { name: 'Открыть RROLES-1: Перенесена редактором' })
  await expect(column(page, 'In Progress').locator(renamed)).toBeVisible()
  await expect(column(page, 'To Do').getByRole('button', { name: /^Открыть RROLES-1: / })).toHaveCount(0)

  // Добавить колонку или изменить доску редактор не может — таких пунктов нет
  await page.getByRole('button', { name: 'Действия с доской «Продукт»' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  for (const item of ['Добавить колонку', 'Добавить дорожку', 'Переименовать доску', 'Изменить описание']) {
    await expect(menu.getByRole('menuitem', { name: item }), item).toHaveCount(0)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Действия с колонкой/ })).toHaveCount(0)

  // 3–4. Комментатор: карточка не переносится
  await openHome(page)
  await openBoard(page, READ, 'Обсуждение')
  const readOnly = page.getByRole('button', { name: 'Открыть RREAD-1: Для комментария' })
  await expect(column(page, 'To Do').locator(readOnly)).toBeVisible()
  const moves: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/move')) moves.push(request.url())
  })
  await drag(page, readOnly, column(page, 'In Progress'))
  await expect(column(page, 'To Do').locator(readOnly)).toBeVisible()
  await page.reload()
  await expect(column(page, 'To Do').getByRole('button', { name: 'Открыть RREAD-1: Для комментария' })).toBeVisible()
  await expect(column(page, 'In Progress').getByRole('button', { name: /^Открыть RREAD-1: / })).toHaveCount(0)
  expect(moves).toEqual([])

  // Название и поля карточки не редактируются
  await page.getByRole('button', { name: 'Открыть RREAD-1: Для комментария' }).click()
  const readWindow = page.getByRole('dialog', { name: 'Для комментария' })
  await expect(readWindow).toBeVisible()
  await expect(readWindow.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
  // Пачка UX-2 (решение PM 22.10, V-5): без права правки «Срочно» — текстом «Да» / «Нет», а не недоступным флажком.
  // Проверяется то же: поставить «Срочно» комментатор не может
  await expect(readWindow.getByRole('checkbox', { name: 'Срочно' })).toHaveCount(0)
  await expect(param(readWindow, 'Срочно')).toHaveText('Нет')
  await expect(readWindow.getByRole('button', { name: 'Изменить метки' })).toHaveCount(0)
  await expect(readWindow.getByRole('button', { name: 'Добавить участников' })).toHaveCount(0)

  // Комментарий появился в карточке (и остаётся после обновления страницы)
  const text = 'Проверка ТК-R2.1'
  await readWindow.getByRole('textbox', { name: 'Новый комментарий' }).click()
  await page.keyboard.type(text)
  await readWindow.getByRole('button', { name: 'Отправить' }).click()
  await expect(readWindow.getByRole('listitem').filter({ hasText: text })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog').getByRole('listitem').filter({ hasText: text })).toBeVisible()
})
