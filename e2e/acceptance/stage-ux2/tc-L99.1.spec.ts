import { expect, test, type Route } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP } from './helpers'

/**
 * ТК-L99.1 (LATER-99): меню «⋯» доски, открытое, пока доска ещё грузится, остаётся открытым и после загрузки — уже
 * с пунктами загруженной доски; Esc закрывает его, рамка фокуса — на «⋯» доски. Медленная сеть («Slow 4G») — ответ
 * доски `/api/v1/boards/<id>` придерживается, пока тест его не отпустит. «Продуктовые команды» → «Разработка» →
 * RACC «Приёмка рядов» (устроена как «Разработка», первая доска — «Дежурства»); Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L99.1. Меню «⋯» доски, открытое во время загрузки, не закрывается само @tc-L99.1', async ({ page }) => {
  // Медленная сеть: ответы досок ждут, пока их не отпустят
  const held: Route[] = []
  let release = false
  await page.route(
    (url) => /^\/api\/v1\/boards\/[^/]+$/.test(url.pathname),
    async (route) => {
      if (release) return route.continue()
      held.push(route)
    },
  )

  // 1. «Разработка» — доски пространства рядами
  await page.goto('/spaces/RACC')
  const board = page.getByRole('region', { name: 'Дежурства', exact: true, includeHidden: true })
  await expect(board.getByText('Загрузка доски…')).toBeVisible()
  await expect.poll(() => held.length).toBeGreaterThan(0)

  // 2. Пока доска грузится — «⋯» в её шапке
  const more = page.getByRole('button', { name: 'Действия с доской «Дежурства»' })
  await more.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(board.getByText('Загрузка доски…')).toBeVisible()

  // 3. Доска загрузилась — меню открыто, в нём пункты загруженной доски
  release = true
  for (const route of held.splice(0)) await route.continue()
  await expect(board.getByText('Загрузка доски…')).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Архив карточек' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Добавить колонку' })).toBeVisible()
  await expect(menu).toBeVisible()

  // Esc закрывает меню, рамка фокуса — на «⋯» доски
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more).toBeFocused()
  expect(await more.evaluate((e) => e.matches(':focus-visible')), 'рамка фокуса видна').toBe(true)
})
