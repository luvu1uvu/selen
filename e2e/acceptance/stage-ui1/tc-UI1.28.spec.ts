import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, openWinBoard, param } from './helpers'

/**
 * ТК-UI1.28 (решение PM 22.10): пустое значение — где поле можно изменить, действием («Назначить», «Добавить
 * участников»); при просмотре — «—» во всех полях. Анна → e2e-editor; карточка на доске — WIN «Просто карточка»,
 * только для просмотра — WIN «Лежит в архиве» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.28. Пустые значения: действие или «—» @tc-UI1.28', async ({ page }) => {
  // 1. Карточка на доске: пустые поля — действиями
  const window = await openCard(page, 'Просто карточка')
  const main = window.getByRole('region', { name: 'Основные параметры' })
  await expect(param(main, 'Ответственный')).toHaveText('Назначить')
  await expect(param(main, 'Участники')).toHaveText('Добавить участников')
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()

  // 2. Карточка из архива (только просмотр): пустые поля — «—»
  await openWinBoard(page)
  await page.getByRole('button', { name: /^Действия с доской/ }).click()
  await page.getByRole('menuitem', { name: 'Архив карточек' }).click()
  const archive = page.getByRole('dialog', { name: 'Архив карточек' })
  await expect(archive.getByText('Лежит в архиве')).toBeVisible()
  await archive
    .getByRole('link', { name: /^WIN-\d+$/ })
    .first()
    .click()
  const archived = page.getByRole('dialog', { name: 'Лежит в архиве' })
  const view = archived.getByRole('region', { name: 'Основные параметры' })
  for (const name of ['Ответственный', 'Участники', 'План, ч']) {
    await expect(param(view, name), name).toHaveText('—')
  }
  await expect(view.getByText(/Не назначен|Не задан|Нет меток/)).toHaveCount(0)
})
