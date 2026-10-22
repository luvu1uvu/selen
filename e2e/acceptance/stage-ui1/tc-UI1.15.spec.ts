import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, tile } from './helpers'

/**
 * ТК-UI1.15: заблокированную карточку видно сразу — плашка с причиной, кто и когда, кнопкой «Снять блокировку» сразу
 * под линией с «+» и «⋯» (и после повторного открытия); после снятия плашки нет, эпизод — в секции «Блокировки»
 * (кто снял и когда). Новая карточка → WIN-11 «Для блокировки» (E2eSeeder); Анна → e2e-editor.
 *
 * Кнопка сейчас подписана «Снять», а не «Снять блокировку» (LATER-95), — проверка подписи мягкая: тест падает до
 * исправления, остальное проверяется.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const WHO_WHEN = /E2E Редактор, \d{1,2} \S+ \d{4} г\., \d{2}:\d{2}/

test('ТК-UI1.15. Блокировка: плашка вверху и история @tc-UI1.15', async ({ page }) => {
  let window = await openCard(page, 'Для блокировки')

  // 1. «+» → «Блокировка» → причина «Ждём доступ» → «Заблокировать»
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  await page.getByRole('menuitem', { name: 'Блокировка' }).click()
  const reason = window.getByRole('textbox', { name: 'Причина блокировки' })
  await expect(reason).toBeFocused()
  await reason.fill('Ждём доступ')
  await window.getByRole('button', { name: 'Заблокировать' }).click()
  await expect(page.getByText('Карточка заблокирована')).toBeVisible()

  const expectBanner = async () => {
    // Заметная плашка сразу под линией с «+» и «⋯»: причина, кто и когда, кнопка «Снять блокировку»
    const banner = window.getByText('Ждём доступ', { exact: true })
    await expect(banner).toBeVisible()
    await expect(window.getByText('Заблокирована', { exact: true })).toBeVisible()
    await expect(window.getByText(WHO_WHEN).first()).toBeVisible()
    const row = (await window.getByRole('button', { name: 'Добавить в карточку' }).boundingBox())!
    const top = (await banner.boundingBox())!
    const params = (await window
      .getByRole('button', { name: 'Основные параметры', exact: true })
      .boundingBox())!
    expect(top.y).toBeGreaterThan(row.y + row.height)
    expect(top.y).toBeLessThan(params.y)
    expect
      .soft(
        await window.getByRole('button', { name: 'Снять блокировку' }).count(),
        'кнопка «Снять блокировку»',
      )
      .toBe(1)
  }
  await expectBanner()

  // 2. Закрыть окно и открыть карточку снова — плашка на месте
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  await tile(page, 'Для блокировки').click()
  window = page.getByRole('dialog', { name: 'Для блокировки' })
  await expect(window).toBeVisible()
  await expectBanner()

  // 3. «Снять блокировку»: плашки нет; в секции «Блокировки» — эпизод в истории (кто снял и когда)
  await window.getByRole('button', { name: /^Снять( блокировку)?$/ }).click()
  await expect(page.getByText('Блокировка снята')).toBeVisible()
  await expect(window.getByText('Заблокирована', { exact: true })).toHaveCount(0)
  const history = window.getByRole('region', { name: 'Блокировки' })
  await expect(history.getByText('Ждём доступ', { exact: true })).toBeVisible()
  await expect(history).toContainText(/снял\(а\) E2E Редактор, \d{1,2} \S+ \d{4} г\., \d{2}:\d{2}/)
})
