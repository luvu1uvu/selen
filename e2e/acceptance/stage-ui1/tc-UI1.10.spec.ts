import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { expectNewToast, openWinBoard, tile, trackToasts } from './helpers'

/**
 * ТК-UI1.10: «Описание» видно сразу — пустое с серой подсказкой «Добавьте описание…»; щелчок по подсказке открывает
 * редактор, «Сохранить описание» — «Сохранено»; непустое правится карандашом «Изменить описание» в заголовке секции.
 * Доска «Продукт» → доска «Окно» пространства WIN (E2eSeeder), новая карточка — «+ Карточка» в Backlog; Анна →
 * e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const TITLE = 'ТК-UI1.10: новая карточка'

test('ТК-UI1.10. Описание: подсказка в пустом, добавление и правка @tc-UI1.10', async ({
  page,
}) => {
  // 1. Создать карточку на доске («+ Карточка»), открыть её
  await openWinBoard(page)
  await page.getByRole('button', { name: 'Добавить карточку в Backlog' }).click()
  await page.getByRole('textbox', { name: 'Добавить карточку в Backlog' }).fill(TITLE)
  await page.keyboard.press('Enter')
  await expect(tile(page, TITLE)).toBeVisible()
  await page.keyboard.press('Escape')
  await tile(page, TITLE).click()
  const window = page.getByRole('dialog', { name: TITLE })
  await expect(window).toBeVisible()
  await trackToasts(page)

  // В «Описании» — серая подсказка «Добавьте описание…»
  const description = window.getByRole('region', { name: 'Описание' })
  const hint = description.getByRole('button', { name: 'Добавьте описание…' })
  await expect(hint).toBeVisible()
  expect(await hint.evaluate((e) => getComputedStyle(e).color)).not.toBe(
    await window
      .getByRole('textbox', { name: 'Название' })
      .evaluate((e) => getComputedStyle(e).color),
  )

  // 2. Щёлкнуть подсказку, написать текст, «Сохранить описание» — «Сохранено»
  await hint.click()
  const editor = description.getByRole('textbox', { name: 'Описание' })
  await expect(editor).toBeFocused()
  await page.keyboard.type('Первая версия описания')
  await expectNewToast(page, 'Сохранено', () =>
    description.getByRole('button', { name: 'Сохранить описание' }).click(),
  )
  await expect(description).toContainText('Первая версия описания')
  await expect(editor).toHaveCount(0)

  // 3. Карандаш в заголовке «Описания» → изменить текст → сохранить
  await description.getByRole('button', { name: 'Изменить описание' }).click()
  await expect(editor).toBeFocused()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' — исправлено')
  await expectNewToast(page, 'Сохранено', () =>
    description.getByRole('button', { name: 'Сохранить описание' }).click(),
  )
  await expect(description).toContainText('Первая версия описания — исправлено')
})
