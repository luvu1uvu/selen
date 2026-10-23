import { expect, test, type Page } from '@playwright/test'
import { authFile } from './helpers'

/**
 * Находки «важно» UX/UI-ревью пачки UX-2. U-1: длинная ссылка и плашка блокировки длинным названием не растягивают окно
 * карточки вбок — название обрезается «…» (как строка дерева, LATER-109). U-2: после Esc в меню «⋯» строки дерева
 * подсказка «⋯» не открывается, и следующий Esc закрывает выезжающее меню, а не подсказку (как у `ActionsMenu`).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const LONG = 'Макет экрана оформления заказа для планшета и телефона, все состояния: пусто, ошибка, загрузка и успех, тёмная тема'

/** Карточке QA-3 подменяется ответ: длинная ссылка и блокировка карточкой с длинным названием. */
async function openLongCard(page: Page) {
  await page.route('**/api/v1/cards/QA-3', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const body = (await response.json()) as { data: Record<string, unknown> }
    body.data.links = [{ id: 'long-link', url: 'https://figma.com/file/checkout', title: LONG }]
    body.data.blocks = [
      {
        id: 'long-block',
        reason: null,
        blocking_card: { hidden: false, id: 'x', key: 'QA-1', title: LONG, category: 'queue', archived: false },
        started_at: '2026-10-20T09:00:00Z',
        started_by: { id: 'u', name: 'E2E Администратор' },
        ended_at: null,
        ended_by: null,
        end_reason: null,
      },
    ]
    await route.fulfill({ response, json: body })
  })
  await page.goto('/cards/QA-3')
  const window = page.getByRole('dialog', { name: 'Блокирующая задача' })
  await expect(window.getByText('figma.com')).toBeVisible()
  return window
}

for (const width of [375, 1280]) {
  test(`окно карточки на ${width} px — без прокрутки вбок, длинная ссылка и плашка обрезаны (U-1)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const window = await openLongCard(page)

    const sizes = await window.evaluate((element) => {
      const scroller = [element, ...element.querySelectorAll<HTMLElement>('*')].find(
        (node) => getComputedStyle(node).overflowY === 'auto',
      )!
      return { scroll: scroller.scrollWidth, client: scroller.clientWidth }
    })
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client)

    const link = window.getByRole('link', { name: LONG })
    const truncated = await link.evaluate((element) => element.scrollWidth > element.clientWidth)
    expect(truncated, 'ссылка обрезана «…»').toBe(true)
    await expect(window.getByRole('button', { name: 'Снять блокировку' })).toBeInViewport()
  })
}

test('после Esc в меню «⋯» строки дерева подсказки нет, следующий Esc закрывает выезжающее меню (U-2)', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  const menu = page.getByRole('dialog', { name: 'Меню' })
  const rowMenu = menu.getByRole('button', { name: 'Меню «Сквозные тесты»' })
  await rowMenu.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(rowMenu).toBeFocused()
  await expect(page.getByRole('tooltip')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})
