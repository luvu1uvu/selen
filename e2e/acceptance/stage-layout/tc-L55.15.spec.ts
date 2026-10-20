import { expect, test, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { DUTY, dropBoard, grabBoard, layout, loaded, openSpace, overHeader, rect, START_LAYOUT, WIDE } from './rows'

/**
 * ТК-L55.15 (LATER-55, дополнение PM 19.10): администратор пространства переносит доску в ряду за ⠿. Пока кнопка
 * зажата, доски не перестраиваются: за указателем — полупрозрачная копия шапки, на месте броска — тёмная вертикальная
 * линия слева от «Дежурства»; после отпускания «Широкая доска» — первой в ряду, и так же после обновления страницы;
 * перенос обратно возвращает раскладку. «Разработка» демо-данных → RDRAG «Перенос досок приёмки» (E2eSeeder),
 * Анна → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RDRAG', 'Перенос досок приёмки'] as const

/** Копия шапки под указателем (вне блоков досок и дерева): где она и насколько прозрачна. */
function dragCopy(page: Page, name: string) {
  return page.evaluate((name) => {
    const copies = [...document.querySelectorAll('body *')].filter(
      (e) =>
        e.children.length === 0 &&
        e.textContent === name &&
        !e.closest('section[data-board-block]') &&
        !e.closest('nav') &&
        e.getBoundingClientRect().width > 0,
    )
    return copies.map((e) => {
      let opacity = 1
      for (let el: Element | null = e; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
      const box = e.getBoundingClientRect()
      return { x: box.left, y: box.top, right: box.right, bottom: box.bottom, opacity }
    })
  }, name)
}

/** Линия-указатель места броска. */
function dropLine(page: Page) {
  return page.locator('[data-board-drop]').evaluate((line) => {
    const box = line.getBoundingClientRect()
    return { kind: line.getAttribute('data-board-drop'), x: box.left + box.width / 2, top: box.top, width: box.width, height: box.height, color: getComputedStyle(line).backgroundColor }
  })
}

test('ТК-L55.15. Администратор переносит доску в ряду @tc-L55.15', async ({ page }) => {
  await openSpace(page, ...SPACE)
  await loaded(page, DUTY)
  await loaded(page, WIDE)
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
  const before = { duty: await rect(page, DUTY), wide: await rect(page, WIDE) }

  // 1. Взять «Широкую доску» за ⠿ и, не отпуская, подвести к левой половине шапки «Дежурства»
  const target = await overHeader(page, DUTY, 'left')
  await grabBoard(page, WIDE, target)
  // Пока кнопка зажата, доски не перестраиваются
  await expect(page.locator('[data-board-drop]')).toBeVisible()
  expect(await layout(page)).toEqual(START_LAYOUT)
  expect(await rect(page, DUTY)).toEqual(before.duty)
  expect(await rect(page, WIDE)).toEqual(before.wide)
  // За указателем — полупрозрачная копия шапки «Широкая доска»
  const copies = await dragCopy(page, WIDE)
  expect(copies).toHaveLength(1)
  expect(copies[0].opacity).toBeLessThan(1)
  expect(copies[0].opacity).toBeGreaterThan(0.3)
  expect(Math.abs(copies[0].y - target.y)).toBeLessThan(40)
  // Слева от «Дежурства» — тёмная вертикальная линия (место, куда встанет доска)
  const line = await dropLine(page)
  expect(line.kind).toBe('row')
  expect(line.height).toBeGreaterThan(line.width * 5)
  expect(Math.abs(line.x - before.duty.left)).toBeLessThanOrEqual(2)
  expect(line.top).toBeGreaterThanOrEqual(before.duty.top - 2)
  expect(line.color).not.toBe('rgba(0, 0, 0, 0)')

  // 2. Отпустить — в первом ряду слева «Широкая доска», справа «Дежурства»
  await dropBoard(page)
  await expect.poll(() => layout(page)).toEqual([[WIDE, DUTY], ...START_LAYOUT.slice(1)])

  // 3. Обновить страницу — так же
  await page.reload()
  await expect(page.getByRole('heading', { name: SPACE[1], level: 1 })).toBeVisible()
  await loaded(page, DUTY)
  await expect.poll(() => layout(page)).toEqual([[WIDE, DUTY], ...START_LAYOUT.slice(1)])

  // 4. Вернуть: «Дежурства» за ⠿ — над левой половиной шапки «Широкой доски»
  await grabBoard(page, DUTY, await overHeader(page, WIDE, 'left'))
  await expect(page.locator('[data-board-drop="row"]')).toBeVisible()
  await dropBoard(page)
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
})
