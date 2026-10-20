import { expect, test, type Page } from '@playwright/test'
import { authFile, openHome, pageAs } from './helpers'

/**
 * Перестановка досок пространства (LATER-55, PR 3, ADR-0019): администратор пространства переносит доску за ⠿ мышью
 * (в ряд рядом с другой доской или отдельным рядом между рядами) и пунктами меню «⋯» → «Переставить» (с клавиатуры);
 * раскладка общая. Пространство ARRANGE «Перестановка» (E2eSeeder): «Первая», «Вторая», «Третья» — по одной в ряду;
 * e2e-admin — администратор, e2e-editor — editor. Тесты идут по порядку и продолжают раскладку предыдущего.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })
test.describe.configure({ mode: 'serial' })

async function openArrange(page: Page) {
  await page.goto('/spaces/ARRANGE')
  await expect(page.getByRole('heading', { name: 'Перестановка', level: 1 })).toBeVisible()
  for (const name of ['Первая', 'Вторая', 'Третья'])
    await expect(page.getByRole('region', { name }).locator('[data-board-body]')).toBeVisible()
}

/** Раскладка как видно на экране: ряды сверху вниз, в ряду — названия досок слева направо. */
function layout(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-board-row]')].map((row) =>
      [...row.querySelectorAll('section[data-board-block]')].map((section) => section.getAttribute('aria-label')),
    ),
  )
}

/** Взять доску за ⠿ и вести указатель к точке; до отпускания — проверить линию-указатель. */
async function dragBoard(page: Page, board: string, to: { x: number; y: number }, line: 'row' | 'newRow') {
  const handle = page.getByRole('region', { name: board }).locator('[data-board-handle]')
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 15 })
  // Во время переноса раскладка не меняется: копия шапки под указателем и линия на месте броска
  await expect(page.locator(`[data-board-drop="${line}"]`)).toBeVisible()
  const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
  await page.mouse.up()
  expect((await moved).ok()).toBe(true)
  await expect(page.locator('[data-board-drop]')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await openHome(page)
  await openArrange(page)
})

test('мышью за ⠿ — в ряд справа от другой доски; раскладка общая и после перезагрузки', async ({ page, browser }) => {
  expect(await layout(page)).toEqual([['Первая'], ['Вторая'], ['Третья']])

  // Над правой половиной шапки «Первой» — справа от неё
  const first = (await page.getByRole('region', { name: 'Первая' }).locator('header').boundingBox())!
  await dragBoard(page, 'Третья', { x: first.x + first.width * 0.75, y: first.y + first.height / 2 }, 'row')
  await expect.poll(() => layout(page)).toEqual([['Первая', 'Третья'], ['Вторая']])

  await page.reload()
  await openArrange(page)
  expect(await layout(page)).toEqual([['Первая', 'Третья'], ['Вторая']])

  const editor = await pageAs(browser, 'e2e-editor@selen.test')
  await openArrange(editor)
  expect(await layout(editor)).toEqual([['Первая', 'Третья'], ['Вторая']])
  await editor.context().close()
})

test('мышью за ⠿ — отдельным рядом между рядами', async ({ page }) => {
  // Зазор между первым и вторым рядом
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-board-row]')].map((row) => {
      const box = row.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left }
    }),
  )
  const gap = (rows[0].bottom + rows[1].top) / 2
  await dragBoard(page, 'Третья', { x: rows[0].left + 200, y: gap }, 'newRow')
  await expect.poll(() => layout(page)).toEqual([['Первая'], ['Третья'], ['Вторая']])
})

test('с клавиатуры — меню «⋯» → «Переставить»: в ряд выше, левее, отдельным рядом', async ({ page }) => {
  const arrange = async (board: string, item: string) => {
    const menu = page.getByRole('region', { name: board }).getByRole('button', { name: `Действия с доской «${board}»` })
    await menu.focus()
    await page.keyboard.press('Enter')
    const trigger = page.getByRole('menuitem', { name: 'Переставить' })
    await trigger.focus()
    await page.keyboard.press('ArrowRight')
    const target = page.getByRole('menuitem', { name: item })
    await expect(target).toBeVisible()
    // Стрелками до нужного пункта (недоступные пропускаются)
    for (let i = 0; i < 6 && !(await target.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('ArrowDown')
    await expect(target).toBeFocused()
    const moved = page.waitForResponse((r) => r.url().includes('/move') && r.request().method() === 'POST')
    await page.keyboard.press('Enter')
    expect((await moved).ok()).toBe(true)
  }

  expect(await layout(page)).toEqual([['Первая'], ['Третья'], ['Вторая']])
  await arrange('Вторая', 'В ряд выше')
  await expect.poll(() => layout(page)).toEqual([['Первая'], ['Третья', 'Вторая']])
  await arrange('Вторая', 'Левее')
  await expect.poll(() => layout(page)).toEqual([['Первая'], ['Вторая', 'Третья']])
  await arrange('Вторая', 'Отдельным рядом')
  await expect.poll(() => layout(page)).toEqual([['Первая'], ['Третья'], ['Вторая']])
})

test('у участника без прав администратора нет ни ручки ⠿, ни пунктов перестановки', async ({ browser }) => {
  const editor = await pageAs(browser, 'e2e-editor@selen.test')
  await openArrange(editor)
  await expect(editor.locator('[data-board-handle]')).toHaveCount(0)
  await editor.getByRole('region', { name: 'Первая' }).getByRole('button', { name: 'Действия с доской «Первая»' }).click()
  await expect(editor.getByRole('menuitem', { name: 'Архив карточек' })).toBeVisible()
  await expect(editor.getByRole('menuitem', { name: 'Переставить' })).toHaveCount(0)
  await editor.context().close()
})
