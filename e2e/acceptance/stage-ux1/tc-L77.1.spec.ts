import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { columnHeader, DESKTOP, expectHint, focused, isTruncated, moveMouseAway } from './helpers'

/**
 * ТК-L77.1 (LATER-77): заголовок колонки как в Kaiten — название слева на всю ширину, справа цветная точка категории
 * с подсказкой «Очередь» / «В работе» / «Готово» (по наведению и по фокусу Tab), число карточек, «+», «⋯»; текстовых
 * бейджей категории нет; у подколонок точки нет. «Продукт» → «Длинная доска» (LAYOUT, шаблон «Разработка»), Анна →
 * e2e-admin (администратор «Раскладки» — видит «⋯» колонок); подколонки — доска «Дорожки» (QA: у In Progress —
 * «Разработка» и «Ревью»). Доски только смотрим.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

test('ТК-L77.1. Заголовок колонки: название на всю ширину, тип — точкой @tc-L77.1', async ({ page }) => {
  // 1. Открыть доску
  await openHome(page)
  await openBoard(page, 'Раскладка', 'Длинная доска')
  const header = page.locator('[data-board-columns]')

  // 2. «Ready for Testing» и «Ready for Merge» — целиком, без многоточия; название — слева, справа точка, число, «+», «⋯»
  for (const name of ['Ready for Testing', 'Ready for Merge']) {
    const title = header.getByText(name, { exact: true })
    await expect(title).toBeVisible()
    expect(await isTruncated(title)).toBe(false)
  }
  const backlog = columnHeader(page, 'Backlog')
  const parts = [
    backlog.getByText('Backlog', { exact: true }),
    backlog.getByRole('img', { name: 'Очередь', exact: true }),
    backlog.getByText(/^\d+$/),
    backlog.getByRole('button', { name: 'Добавить карточку в начало Backlog' }),
    backlog.getByRole('button', { name: 'Действия с колонкой «Backlog»' }),
  ]
  const boxes = await Promise.all(parts.map(async (part) => (await part.boundingBox())!))
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 1)
  // Название занимает всю ширину до точки: точка, число, «+» и «⋯» прижаты вправо
  const row = (await backlog.boundingBox())!
  expect(row.x + row.width - (boxes[4].x + boxes[4].width)).toBeLessThan(16)
  expect(boxes[0].x - row.x).toBeLessThan(16)

  // Надписей «Очередь» / «В работе» / «Готово» в заголовках нет — тип только точкой
  for (const label of ['Очередь', 'В работе', 'Готово']) await expect(header.getByText(label, { exact: true })).toHaveCount(0)

  // 3. Подсказки над точками по наведению: Backlog, In Progress, Done
  for (const [column, category] of [
    ['Backlog', 'Очередь'],
    ['In Progress', 'В работе'],
    ['Done', 'Готово'],
  ]) {
    await columnHeader(page, column).getByRole('img', { name: category, exact: true }).hover()
    await expectHint(page, category)
  }
  await moveMouseAway(page)
  await page.locator('[data-board-body]').evaluate((body) => (body.scrollLeft = 0))

  // 4. Tab с «⋯» в шапке доски — до точки «Backlog»; над ней — подсказка «Очередь»
  const dot = backlog.getByRole('img', { name: 'Очередь', exact: true })
  await page.getByRole('button', { name: 'Действия с доской «Длинная доска»' }).focus()
  const path: string[] = []
  for (let i = 0; i < 3 && !(await dot.evaluate((e) => e === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
    path.push(await focused(page))
  }
  await expect(dot).toBeFocused()
  // По пути — только шапка доски, название «Backlog» (видно целиком) Tab пропускает
  expect(path.at(-1)).toBe('Очередь')
  expect(path).not.toContain('Backlog')
  await expectHint(page, 'Очередь')
})

test('ТК-L77.1. У подколонок точки категории нет @tc-L77.1', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Дорожки')
  const dots = (name: string) =>
    page.locator('[data-board-columns]').evaluate((header, name) => {
      const title = [...header.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent === name)!
      return [...title.parentElement!.querySelectorAll('[role="img"]')].map((e) => e.getAttribute('aria-label'))
    }, name)
  expect(await dots('In Progress')).toEqual(['В работе'])
  expect(await dots('To Do')).toEqual(['Очередь'])
  expect(await dots('Разработка')).toEqual([])
  expect(await dots('Ревью')).toEqual([])
})
