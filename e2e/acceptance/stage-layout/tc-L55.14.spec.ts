import { expect, test } from '@playwright/test'
import { authFile, pageAs } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, collapseButton, DUTY, expandButton, loaded, openSpace, rect, WIDE } from './rows'

/**
 * ТК-L55.14 (LATER-55; ответ PM 19.10 — свёрнутая доска сжимается до шапки, соседи справа сдвигаются; решение PM 21.10,
 * вариант Б — доски в ряду не сжимаются, не поместилась — строкой ниже): стрелка ˄ с подсказкой «Свернуть доску
 * «Дежурства»» сворачивает доску в одну строку «Дежурства · 6 карточек» со стрелкой ˅, блок — по ширине этой строки;
 * «Широкая доска» (шире экрана) остаётся под ней. Свёрнутая «Широкая доска» — строка, она помещается и встаёт справа от
 * «Дежурства». После обновления страницы обе свёрнуты; щелчок по названию в свёрнутой шапке разворачивает (карточки на
 * месте, «Широкая доска» снова под «Дежурства»); сворачивание личное — у Бориса доска развёрнута. «Разработка»
 * демо-данных → RFOLD «Сворачивание приёмки» (E2eSeeder), Анна → e2e-admin, Борис → e2e-editor. В конце всё развёрнуто.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RFOLD', 'Сворачивание приёмки'] as const
const DUTY_CARDS = /^Открыть RFOLD-\d+: Дежурство \d$/

test('ТК-L55.14. Свернуть доску — «Название · N карточек», сжимается до шапки @tc-L55.14', async ({ page, browser }) => {
  await openSpace(page, ...SPACE)
  await loaded(page, DUTY)
  await loaded(page, WIDE)
  const before = { duty: await rect(page, DUTY), wide: await rect(page, WIDE) }
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)

  // 1. Навести на стрелку ˄ справа в шапке «Дежурства» — подсказка; нажать её
  const collapse = collapseButton(page, DUTY)
  await collapse.hover()
  const hint = 'Свернуть доску «Дежурства»'
  await expect(page.getByRole('tooltip', { name: hint })).toBeAttached()
  const shown = await page.getByText(hint, { exact: true }).evaluateAll((all) =>
    Math.max(...all.map((e) => e.getBoundingClientRect().width)),
  )
  expect(shown).toBeGreaterThan(40)
  await collapse.click()

  // Одна строка «Дежурства · 6 карточек» со стрелкой ˅; блок по ширине строки; «Широкая доска» — под ней во всю ширину
  const expand = expandButton(page, DUTY)
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  const header = block(page, DUTY).locator('header').first()
  await expect(header).toContainText('Дежурства')
  await expect(header).toContainText('· 6 карточек')
  await expect(block(page, DUTY).locator('[data-board-body]')).toHaveCount(0)
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(0)
  const collapsed = await rect(page, DUTY)
  const headerBox = (await header.boundingBox())!
  expect(collapsed.height).toBeLessThanOrEqual(headerBox.height + 2)
  expect(Math.abs(collapsed.width - headerBox.width)).toBeLessThanOrEqual(2)
  expect(collapsed.width).toBeLessThan(before.duty.width - 100)
  await expect.poll(async () => Math.round((await rect(page, WIDE)).top - collapsed.bottom)).toBe(12)
  expect((await rect(page, WIDE)).left).toBe(before.wide.left)
  expect((await rect(page, WIDE)).width).toBe(before.wide.width)

  // 2. Свернуть «Широкую доску» — строка «Широкая доска · 0 карточек» встаёт справа от «Дежурства»
  await collapseButton(page, WIDE).click()
  const wideHeader = block(page, WIDE).locator('header').first()
  await expect(wideHeader).toContainText('· 0 карточек')
  await expect.poll(async () => Math.round((await rect(page, WIDE)).left - (await rect(page, DUTY)).right)).toBe(12)
  expect((await rect(page, WIDE)).top).toBe((await rect(page, DUTY)).top)

  // 3. Обновить страницу — обе по-прежнему свёрнуты
  await page.reload()
  await expect(page.getByRole('heading', { name: SPACE[1], level: 1 })).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expandButton(page, WIDE)).toHaveAttribute('aria-expanded', 'false')
  await expect(header).toContainText('· 6 карточек')
  await expect(block(page, DUTY).locator('[data-board-body]')).toHaveCount(0)

  // 4. Нажать на название в свёрнутой шапке — «Широкой доски», затем «Дежурства»: развернулись, карточки на месте,
  // «Широкая доска» — снова под «Дежурства»
  await wideHeader.getByRole('heading', { name: WIDE, exact: true }).click()
  await loaded(page, WIDE)
  await header.getByRole('heading', { name: DUTY, exact: true }).click()
  await loaded(page, DUTY)
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)
  await expect.poll(() => rect(page, WIDE)).toEqual(before.wide)

  // 5. Свернуть «Дежурства» снова; у Бориса (второй браузер) она развёрнута
  await collapse.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  const boris = await pageAs(browser, 'e2e-editor@selen.test')
  await openSpace(boris, ...SPACE)
  await loaded(boris, DUTY)
  await expect(collapseButton(boris, DUTY)).toHaveAttribute('aria-expanded', 'true')
  await expect(block(boris, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)
  await boris.context().close()

  // 6. У Анны развернуть «Дежурства» стрелкой ˅ — как было
  await expand.click()
  await loaded(page, DUTY)
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)
})
