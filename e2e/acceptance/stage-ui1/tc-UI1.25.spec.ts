import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { dropFile, menuItems, openCard, openWinBoard } from './helpers'

/**
 * ТК-UI1.25 (решение PM 2): «+» показывает только разрешённое — комментатору только «Файл…»; у карточки в архиве
 * «+» нет и брошенный на окно файл не прикладывается; редактору — все шесть пунктов. Вера (комментатор) → e2e-editor
 * в MOB «Мобильные приложения», карточка MOB-1; Анна → e2e-editor в WIN «Окно карточки»: карточка из архива — WIN-15
 * «Лежит в архиве», карточка на доске — WIN-18 «Просто карточка» (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.25. «+» показывает только разрешённое @tc-UI1.25', async ({ page }) => {
  // 1. Комментатор: доска → открыть карточку → «+» — только «Файл…»
  await page.goto('/spaces/MOB')
  await page
    .getByRole('region', { name: 'Релизы', exact: true })
    .getByRole('button', { name: /^Открыть MOB-1: / })
    .click()
  const mobile = page.getByRole('dialog', { name: 'Релиз мобильного приложения' })
  await mobile.getByRole('button', { name: 'Добавить в карточку' }).click()
  expect(await menuItems(page)).toEqual(['Файл…'])
  await page.keyboard.press('Escape')

  // 2. Редактор: «⋯» доски → «Архив карточек» → открыть карточку из архива: «+» нет, брошенный файл не прикладывается
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
  await expect(archived).toBeVisible()
  await expect(archived.getByText('Карточка в архиве', { exact: true })).toBeVisible()
  await expect(archived.getByRole('button', { name: 'Добавить в карточку' })).toHaveCount(0)
  await dropFile(
    page,
    archived.getByRole('region', { name: 'Описание' }),
    'в-архив.png',
    async () => {
      await expect(archived.getByText('Отпустите, чтобы приложить файл')).toHaveCount(0)
    },
  )
  await page.waitForTimeout(1000)
  await expect(archived.getByRole('region', { name: 'Файлы' })).toHaveCount(0)
  await expect(page.getByText(/^Файл «в-архив\.png» приложен$/)).toHaveCount(0)

  // 3. Редактор: открыть карточку на доске → «+» — все шесть пунктов
  const window = await openCard(page, 'Просто карточка')
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  expect(await menuItems(page)).toEqual([
    'Чек-лист',
    'Файл…',
    'Ссылку…',
    'Родительскую карточку…',
    'Дочернюю карточку…',
    'Блокировку…',
  ])
})
