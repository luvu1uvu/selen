import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectHint } from '../stage-ux1/helpers'
import { copiedText, openCard, stubClipboard } from './helpers'

/**
 * ТК-UI1.5: шапка окна — крупное название; под ним «WIN-N · Заказчик <имя>»; ниже серым «Создана … назад ·
 * Перемещена … назад», точные дата и время — в подсказке; щелчок по номеру копирует ссылку («Ссылка скопирована»).
 * Карточка из Done «Продукта» → WIN-1 «Готовая с комментариями» (E2eSeeder: перенесена из To Do в Done); Анна →
 * e2e-editor (он же заказчик карточки — её создал).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.5. Шапка окна: название, номер, заказчик, время @tc-UI1.5', async ({ page }) => {
  // 1. Открыть карточку в колонке Done
  await stubClipboard(page)
  const window = await openCard(page, 'Готовая с комментариями')

  // Крупное название; под ним номер и заказчик
  const title = window.getByRole('textbox', { name: 'Название' })
  await expect(title).toHaveValue('Готовая с комментариями')
  expect(
    Number.parseFloat(await title.evaluate((e) => getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(20)
  const number = window.getByRole('button', { name: 'WIN-1. Скопировать ссылку на карточку' })
  await expect(number).toHaveText('WIN-1')
  await expect(window.getByText('Заказчик', { exact: true })).toBeVisible()
  await expect(window.getByRole('button', { name: 'E2E Редактор — заказчик' })).toBeVisible()

  // Ниже серым: «Создана … · Перемещена …»
  const created = window.locator('time').filter({ hasText: /^Создана / })
  const moved = window.locator('time').filter({ hasText: /^Перемещена / })
  await expect(created).toHaveText(/^Создана (только что|.+ назад)$/)
  await expect(moved).toHaveText(/^Перемещена (только что|.+ назад)$/)
  expect((await created.boundingBox())!.y).toBeGreaterThan((await number.boundingBox())!.y)

  // 2. Навести указатель на серую строку — подсказка с точными датой и временем
  await created.hover()
  const exact = await created.getAttribute('aria-description')
  // Кто создал — словами: «… · создал(а) ФИО» (пачка UX-2, V-4 UX-ревью UI-1a; было «…, ФИО»)
  expect(exact).toMatch(/^\d{1,2} \S+ \d{4} г\., \d{2}:\d{2} · создал\(а\) E2E Редактор$/)
  await expectHint(page, exact!)
  await moved.hover()
  const movedExact = await moved.getAttribute('aria-description')
  expect(movedExact).toMatch(/^\d{1,2} \S+ \d{4} г\., \d{2}:\d{2}$/)
  await expectHint(page, movedExact!)

  // 3. Щёлкнуть номер карточки — «Ссылка скопирована»
  await page.mouse.move(0, 0)
  await number.click()
  await expect(page.getByText('Ссылка скопирована')).toBeVisible()
  expect(await copiedText(page)).toMatch(/\/cards\/WIN-1$/)
})
