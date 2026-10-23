import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import {
  expectNewToast,
  openCard,
  param,
  tile,
  toastCount,
  toastsSince,
  trackToasts,
} from './helpers'

/**
 * ТК-UI1.7: «Основные параметры» — две колонки «поле — значение» в порядке Расположение, Тип, Ответственный,
 * Участники, Срок, Срочно, Метки, План, ч; срок и метки, пока не заданы, скрыты и добавляются через «+» (LATER-97), план —
 * тоже (решение PM 22.10, пачка UX-2);
 * каждое поле правится, после каждого изменения — «Сохранено»; на плитке —
 * ответственный, срок, метка, срочность, новый тип. Карточка без ответственного → WIN-3 «Поля правятся» (E2eSeeder);
 * Анна → e2e-editor; «Борис Петров» → E2E Администратор, «Вера Иванова» → E2E Подрядчик, метка — «Окно».
 *
 * Метки: сейчас «Сохранено» после их изменения не появляется (LATER-93) — проверка мягкая: тест падает до
 * исправления, остальное проверяется.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

/** Завтрашняя дата (часовой пояс браузера тестов — Europe/Moscow) в формате поля даты. */
function tomorrow() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(
    Date.now() + 86_400_000,
  )
}

test('ТК-UI1.7. «Основные параметры»: поля читаются и правятся @tc-UI1.7', async ({ page }) => {
  // 1. Открыть карточку без ответственного
  const window = await openCard(page, 'Поля правятся')
  await trackToasts(page)
  const main = window.getByRole('region', { name: 'Основные параметры' })

  // Две колонки: слева названия полей, справа значения; порядок полей. Срока и меток у карточки нет — их строк нет
  // (LATER-97: добавляются через «+»)
  await expect(main.locator('dt')).toHaveText([
    'Расположение',
    'Тип',
    'Ответственный',
    'Участники',
    'Срочно',
  ])
  // Пачка UX-2 (решение PM 22.10): «План, ч», пока не задан, скрыт и добавляется через «+», как срок; вместо него — «Срочно»
  for (const name of ['Расположение', 'Ответственный', 'Срочно']) {
    const label = (await main.locator('dt', { hasText: name }).boundingBox())!
    const value = (await param(main, name).boundingBox())!
    expect(value.x, name).toBeGreaterThan(label.x + 100)
    expect(Math.abs(value.y + value.height / 2 - (label.y + label.height / 2)), name).toBeLessThan(
      12,
    )
  }
  await expect(param(main, 'Ответственный')).toHaveText('Назначить')

  // 2. «Ответственный» → набрать «Админ» в поиске → «E2E Администратор»
  await param(main, 'Ответственный').getByRole('button').click()
  await page.getByPlaceholder('Найти по имени').fill('Админ')
  await expectNewToast(page, 'Сохранено', () =>
    page.getByRole('option', { name: /E2E Администратор/ }).click(),
  )
  await expect(param(main, 'Ответственный')).toContainText('E2E Администратор')

  // 3. «Участники» → «Добавить участников» → «E2E Подрядчик»
  await main.getByRole('button', { name: 'Добавить участников' }).click()
  await page.getByPlaceholder('Найти по имени').fill('Подряд')
  await expectNewToast(page, 'Сохранено', () =>
    page.getByRole('option', { name: /E2E Подрядчик/ }).click(),
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(param(main, 'Участники')).toContainText('E2E Подрядчик')

  // 4. «Срок» → завтрашняя дата; «Срочно»; «Метки» → «Окно»; «План, ч» → 2,5, Enter
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Срок' }).click()
  await expectNewToast(page, 'Сохранено', () =>
    page.getByRole('textbox', { name: 'Дата срока' }).fill(tomorrow()),
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: 'Дата срока' })).toHaveCount(0)
  await expect(param(main, 'Срок')).not.toContainText('Не задан')

  await expectNewToast(page, 'Сохранено', () =>
    main.getByRole('checkbox', { name: 'Срочно' }).click(),
  )
  await expect(main.getByRole('checkbox', { name: 'Срочно' })).toBeChecked()

  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Метки' }).click()
  const beforeLabels = await toastCount(page)
  const label = page.getByRole('menuitemcheckbox', { name: 'Окно' })
  await label.click()
  await expect(label).toBeChecked()
  // У остальных полей уведомление приходит сразу после ответа сервера — двух секунд хватает с запасом
  await page.waitForTimeout(2000)
  expect.soft(await toastsSince(page, beforeLabels), 'метки: «Сохранено»').toContain('Сохранено')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(param(main, 'Метки')).toContainText('Окно')

  // Пачка UX-2 (решение PM 22.10): «План, ч» — через «+», поле сразу в фокусе
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'План, ч' }).click()
  const estimate = main.getByRole('textbox', { name: 'План, ч' })
  await expect(estimate).toBeFocused()
  await estimate.fill('2,5')
  await expectNewToast(page, 'Сохранено', () => estimate.press('Enter'))
  await expect(estimate).toHaveValue(/^2[.,]5$/)

  // 5. «Тип» → другой тип
  await main.getByRole('button', { name: 'Задача — тип карточки' }).click()
  await expectNewToast(page, 'Сохранено', () =>
    page.getByRole('menuitemcheckbox', { name: /Баг/ }).click(),
  )
  await expect(main.getByRole('button', { name: 'Баг — тип карточки' })).toBeVisible()

  // 6. Закрыть окно — на плитке ответственный, срок, метка, срочность, новый тип
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const card = tile(page, 'Поля правятся')
  await expect(card.locator('[title="Ответственный: E2E Администратор"]')).toBeVisible()
  await expect(card.locator('[title^="Срок:"]').first()).toBeAttached()
  await expect(card.locator('[title="Окно"]')).toBeVisible()
  await expect(card.locator('[title="Срочно"]')).toBeAttached()
  await expect(card).toContainText('Баг')
})
