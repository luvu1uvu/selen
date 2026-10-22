import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { menuItems, param } from './helpers'

/**
 * ТК-UI1.19: комментатор видит окно без правки — название и поля текстом, без полей ввода, лупы у «Расположения» нет;
 * «+» — только «Загрузить файл», «⋯» — только «Скопировать ссылку»; комментарий написать можно. Вера (комментатор
 * в «Разработке») → e2e-editor, комментатор в MOB «Мобильные приложения»; доска «Продукт» → «Релизы», карточка MOB-1
 * (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

const TEXT = 'ТК-UI1.19: комментарий комментатора'

test('ТК-UI1.19. Комментатор видит окно без правки @tc-UI1.19', async ({ page }) => {
  // 1. Доска «Релизы» → открыть карточку
  await page.goto('/spaces/MOB')
  await page
    .getByRole('region', { name: 'Релизы', exact: true })
    .getByRole('button', { name: /^Открыть MOB-1: / })
    .click()
  const window = page.getByRole('dialog', { name: 'Релиз мобильного приложения' })
  await expect(window).toBeVisible()

  // Название и поля — текстом, без полей ввода; лупы у «Расположения» нет
  await expect(window.getByRole('heading', { name: 'Релиз мобильного приложения' })).toBeVisible()
  await expect(window.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
  const main = window.getByRole('region', { name: 'Основные параметры' })
  await expect(param(main, 'Расположение')).toContainText('Релизы / To Do')
  await expect(main.getByRole('button')).toHaveText(['Основные параметры'])
  await expect(main.getByRole('textbox')).toHaveCount(0)
  await expect(main.getByRole('checkbox', { name: 'Срочно' })).toBeDisabled()
  await expect(window.getByRole('button', { name: /заказчик$/ })).toHaveCount(0)

  // «+» — только «Загрузить файл»
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  expect(await menuItems(page)).toEqual(['Загрузить файл'])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // «⋯» — только «Скопировать ссылку»
  await window
    .getByRole('button', { name: 'Действия с карточкой «Релиз мобильного приложения»' })
    .click()
  expect(await menuItems(page)).toEqual(['Скопировать ссылку'])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)

  // Комментарий написать можно
  await window.getByRole('textbox', { name: 'Новый комментарий' }).click()
  await page.keyboard.type(TEXT)
  await window.getByRole('button', { name: 'Отправить' }).click()
  await expect(window.getByRole('listitem').filter({ hasText: TEXT })).toBeVisible()
})
