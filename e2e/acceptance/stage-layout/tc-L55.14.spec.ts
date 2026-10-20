import { expect, test } from '@playwright/test'
import { authFile, pageAs } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, collapseButton, DUTY, expandButton, loaded, openSpace, rect, WIDE } from './rows'

/**
 * ТК-L55.14 (LATER-55; ответ PM 19.10 — свёрнутая доска сжимается до шапки, соседи справа сдвигаются): стрелка ˄
 * с подсказкой «Свернуть доску «Дежурства»» сворачивает доску в одну строку «Дежурства · 6 карточек» со стрелкой ˅,
 * блок — по ширине этой строки, «Широкая доска» сдвигается влево к ней; после обновления страницы доска свёрнута;
 * щелчок по названию в свёрнутой шапке разворачивает (карточки на месте); сворачивание личное — у Бориса доска
 * развёрнута. «Разработка» демо-данных → RFOLD «Сворачивание приёмки» (E2eSeeder), Анна → e2e-admin, Борис →
 * e2e-editor. В конце доска развёрнута, как была.
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

  // Одна строка «Дежурства · 6 карточек» со стрелкой ˅; блок по ширине строки; «Широкая доска» сдвинулась к нему
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
  await expect.poll(async () => Math.round((await rect(page, WIDE)).left - collapsed.right)).toBe(12)
  expect((await rect(page, WIDE)).left).toBeLessThan(before.wide.left - 100)

  // 2. Обновить страницу — «Дежурства» по-прежнему свёрнута
  await page.reload()
  await expect(page.getByRole('heading', { name: SPACE[1], level: 1 })).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(header).toContainText('· 6 карточек')
  await expect(block(page, DUTY).locator('[data-board-body]')).toHaveCount(0)

  // 3. Нажать на название «Дежурства» в свёрнутой шапке — доска развернулась, карточки на месте
  await header.getByRole('heading', { name: DUTY, exact: true }).click()
  await loaded(page, DUTY)
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)

  // 4. Свернуть снова; у Бориса (второй браузер) «Дежурства» развёрнута
  await collapse.click()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  const boris = await pageAs(browser, 'e2e-editor@selen.test')
  await openSpace(boris, ...SPACE)
  await loaded(boris, DUTY)
  await expect(collapseButton(boris, DUTY)).toHaveAttribute('aria-expanded', 'true')
  await expect(block(boris, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)
  await boris.context().close()

  // 5. У Анны развернуть «Дежурства» стрелкой ˅ — как было
  await expand.click()
  await loaded(page, DUTY)
  await expect(block(page, DUTY).getByRole('button', { name: DUTY_CARDS })).toHaveCount(6)
})
