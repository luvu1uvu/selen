import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { colorsOf, hex } from '../stage-L91/helpers'
import { expectHint } from '../stage-ux1/helpers'
import { DESKTOP, moveMouseOffWindow, openCardByKey, tokenHex, WINDOW_CARD } from './helpers'

/**
 * ТК-L98.11 (UX-ревью UI-1a: V-3, V-4, U-12, V-7): перед «Создана» и «Перемещена» — маленькие серые значки; ✕ окна — на
 * одной линии с названием; подсказка у «Создана» — «<дата и время> · создал(а) <ФИО>»; название при наведении — с
 * рамкой и светло-серым фоном. Анна → e2e-editor; DEV-41 (создал Борис Петров, перенесена) → UXB-1 «Как DEV-41» —
 * создал «E2E Администратор», перенесена из To Do в Done (E2eSeeder::uxBatch2).
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

test('ТК-L98.11. Шапка окна: значки, «создал(а)», ✕ вровень с названием @tc-L98.11', async ({ page }) => {
  // 1. Открыть карточку
  const window = await openCardByKey(page, WINDOW_CARD.key, WINDOW_CARD.title)
  const created = window.locator('time').filter({ hasText: /^Создана / })
  const moved = window.locator('time').filter({ hasText: /^Перемещена / })
  const muted = await tokenHex(page, 'muted-foreground')

  // Перед «Создана» и «Перемещена» — маленькие серые значки
  for (const [what, time] of [
    ['«Создана»', created],
    ['«Перемещена»', moved],
  ] as const) {
    await expect(time).toBeVisible()
    const icon = time.locator('svg').first()
    const iconBox = (await icon.boundingBox())!
    const textBox = (await time.boundingBox())!
    expect(iconBox.width, `${what}: значок маленький`).toBeLessThanOrEqual(14)
    expect(iconBox.x, `${what}: значок — перед текстом`).toBeLessThanOrEqual(textBox.x + 1)
    expect(hex((await colorsOf(icon)).text), `${what}: значок серый`).toBe(muted)
  }

  // ✕ окна — на одной линии с названием (центры по вертикали)
  const title = window.getByRole('textbox', { name: 'Название' })
  const close = window.getByRole('button', { name: 'Закрыть' })
  const titleBox = (await title.boundingBox())!
  const closeBox = (await close.boundingBox())!
  expect(
    Math.abs(titleBox.y + titleBox.height / 2 - (closeBox.y + closeBox.height / 2)),
    '✕ вровень с названием',
  ).toBeLessThanOrEqual(3)

  // 2. Навести указатель на «Создана … назад» — «<дата и время> · создал(а) E2E Администратор»
  await created.hover()
  const hint = page.getByRole('tooltip').filter({ hasText: 'создал(а)' })
  await expect(hint).toBeAttached()
  await expect(hint).toHaveText(/^\d{1,2} \S+ \d{4} г\., \d{2}:\d{2} · создал\(а\) E2E Администратор$/)
  await expectHint(page, (await hint.textContent())!)
  await moveMouseOffWindow(page)

  // 3. Навести указатель на название — рамка и светло-серый фон: видно, что его можно править
  const before = await colorsOf(title)
  await title.hover()
  await expect.poll(async () => hex((await colorsOf(title)).background)).toBe(await tokenHex(page, 'accent'))
  const after = await colorsOf(title)
  expect(after.border.a, 'рамка видна').toBeGreaterThan(0)
  expect(before.background.a, 'без наведения фона нет').toBe(0)
})
