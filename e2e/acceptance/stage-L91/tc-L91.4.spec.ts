import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import {
  COLORS,
  colorsOf,
  contrast,
  expectColor,
  face,
  hex,
  labelsIn,
  openCard,
  openThemeBoard,
  SPACE,
  tile,
} from './helpers'

/**
 * ТК-L91.4 (LATER-91, решение PM 10 по LATER-89): цвет метки любой, текст — автоматически белый или чёрный, что
 * контрастнее: на зелёной, жёлтой, синей, красной — чёрный, на серой — белый, все не меньше 4,5:1; новая метка самого
 * светлого цвета палитры (жёлтая) — с чёрным текстом. «Разработка» → THEME «Тёмная тема», доска «Продукт» → «Вид»
 * (E2eSeeder::themePrep: метки цветов демо-данных), Анна (администратор пространства) → e2e-admin; новую метку тест
 * ставит карточке «Для новой метки».
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const NEW_LABEL = 'Проверка'

test('ТК-L91.4. Текст меток читается на любом цвете @tc-L91.4', async ({ page }) => {
  // 1. Доска: метки «Бэкенд» (зелёная), «Клиент» (жёлтая), «Техдолг» (серая), «Фронтенд» (синяя), «Безопасность» (красная)
  await openThemeBoard(page)
  const board = page.locator('[data-board-body]')
  const seen = new Map((await labelsIn(board)).map((label) => [label.name, label]))
  for (const [name, background, text] of [
    ['Бэкенд', '#22c55e', COLORS.black],
    ['Клиент', '#f59e0b', COLORS.black],
    ['Фронтенд', '#3b82f6', COLORS.black],
    ['Безопасность', '#ef4444', COLORS.black],
    ['Техдолг', '#64748b', COLORS.white],
  ] as const) {
    const label = seen.get(name)
    expect(label, `метка «${name}» на доске`).toBeDefined()
    expectColor(label!.background, background, `цвет метки «${name}»`, 1)
    expectColor(label!.text, text, `текст метки «${name}»`, 0)
    expect(contrast(label!.text, label!.background), `«${name}»: текст к метке`).toBeGreaterThanOrEqual(4.5)
  }

  // 2. Пространство → вкладка «Метки» → «Добавить метку»: «Проверка», самый светлый из предложенных цветов (жёлтый)
  await page.goto('/spaces/THEME')
  await expect(page.getByRole('heading', { name: SPACE, level: 1 })).toBeVisible()
  await page.getByRole('tab', { name: 'Метки' }).click()
  if ((await page.getByRole('button', { name: `Действия с меткой «${NEW_LABEL}»` }).count()) === 0) {
    // (повтор теста в CI после сбоя: метка уже заведена первым проходом)
    await page.getByRole('button', { name: 'Добавить метку' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Название').fill(NEW_LABEL)
    const swatches = form.getByRole('button', { name: /^Цвет #[0-9a-f]{6}$/ })
    const colors = await Promise.all(
      (await swatches.all()).map(async (swatch) => (await swatch.getAttribute('aria-label'))!.slice(5)),
    )
    const lightest = colors.reduce((a, b) => (contrast(a, COLORS.black) >= contrast(b, COLORS.black) ? a : b))
    expect(lightest, 'самый светлый цвет палитры — жёлтый').toBe('#f59e0b')
    await form.getByRole('button', { name: `Цвет ${lightest}` }).click()
    await form.getByRole('button', { name: 'Сохранить' }).click()
    await expect(form).toHaveCount(0)
  }
  const row = page.getByRole('tabpanel').getByText(NEW_LABEL, { exact: true })
  await expect(row).toBeVisible()
  expectColor((await colorsOf(row)).text, COLORS.black, 'новая метка в списке')

  // Открыть карточку доски «Вид» и поставить ей новую метку
  const card = await openCard(page, 'Для новой метки')
  await param(card.getByRole('region', { name: 'Основные параметры' }), 'Метки')
    .getByRole('button', { name: 'Изменить метки' })
    .click()
  const option = page.getByRole('menuitemcheckbox', { name: NEW_LABEL })
  if ((await option.getAttribute('aria-checked')) !== 'true') await option.click()
  await expect(option).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // На новой светлой метке — чёрный текст: в окне карточки и на плитке
  const inWindow = (await labelsIn(card)).find((label) => label.name === NEW_LABEL)
  expect(inWindow, 'новая метка в окне карточки').toBeDefined()
  expectColor(inWindow!.background, '#f59e0b', 'цвет новой метки')
  expect(hex(inWindow!.text)).toBe(COLORS.black)
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(tile(page, 'Для новой метки').locator(`[title="${NEW_LABEL}"]`)).toBeVisible()
  const onTile = (await labelsIn(face(page, 'Для новой метки'))).find((label) => label.name === NEW_LABEL)
  expect(hex(onTile!.text), 'новая метка на плитке — чёрный текст').toBe(COLORS.black)
  expect(contrast(onTile!.text, onTile!.background)).toBeGreaterThanOrEqual(4.5)
})
