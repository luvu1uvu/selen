import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from './helpers'

/**
 * Фасад карточки на доске в светлой теме. Доска DARK «Вид» (E2eSeeder::darkTheme): там есть заблокированная карточка;
 * e2e-editor — участник пространства, тема у него светлая.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

/** Фасад карточки (у него рамка и тень) — внутри кнопки «Открыть …». */
const face = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^Открыть DARK-\\d+: ${title}$`) }).locator(':scope > div')

test('тень при наведении — и у заблокированной карточки (светлая тема, решение PM 27.10)', async ({ page }) => {
  await openHome(page)
  await openBoard(page, 'Тёмная проверка', 'Вид')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

  for (const title of ['Срочная', 'Заблокированная']) {
    const tile = face(page, title)
    await page.mouse.move(0, 0)
    const shadow = () => tile.evaluate((element) => getComputedStyle(element).boxShadow)
    const before = await shadow()
    await tile.hover()
    // Тень при наведении — sm (два слоя: 0 1px 3px и 0 1px 2px), без наведения — xs (0 1px 2px)
    await expect.poll(shadow, `${title}: тень при наведении`).toContain('0px 1px 3px 0px')
    expect(before, `${title}: без наведения тени sm нет`).not.toContain('0px 1px 3px 0px')
  }
})
