import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { menuItems, openCard } from './helpers'

/**
 * ТК-UI1.26 (LATER-97): меню «+» — как в Kaiten, две колонки. Слева группы «Основное», «Связи», «Остальное»; справа
 * «Поля»: поиск и «Создать новое поле» неактивны, подсказка «Пользовательские поля появятся позже». Комментатору —
 * только «Загрузить файл», без колонки «Поля». Анна → e2e-editor, карточка WIN «Просто карточка»; Вера → e2e-editor
 * в MOB (комментатор), карточка MOB-1 (E2eSeeder).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.26. Меню «+» — как в Kaiten, две колонки @tc-UI1.26', async ({ page }) => {
  // 1. Открыть карточку, «+»
  const window = await openCard(page, 'Просто карточка')
  await window.getByRole('button', { name: 'Добавить в карточку' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  // Слева — группы системных пунктов, справа — «Поля»; колонки рядом
  const group = (name: string) => menu.getByRole('group', { name, exact: true })
  // «План, ч» — пункт «Основного» (пачка UX-2, решение PM 22.10)
  await expect(group('Основное').getByRole('menuitem')).toHaveText([
    'Срок',
    'Метки',
    'План, ч',
    'Чек-лист',
    'Ссылка',
    'Загрузить файл',
  ])
  await expect(group('Связи').getByRole('menuitem')).toHaveText([
    'Родительская карточка',
    'Дочерняя карточка',
  ])
  await expect(group('Остальное').getByRole('menuitem')).toHaveText(['Блокировка'])
  const fields = group('Поля')
  const left = (await group('Основное').boundingBox())!
  const right = (await fields.boundingBox())!
  expect(right.x).toBeGreaterThan(left.x + left.width - 1)

  // «Поля» — заглушка до этапа 5: поиск и «Создать новое поле» неактивны, подсказка
  await expect(fields.getByRole('textbox', { name: 'Найти поле' })).toBeDisabled()
  await expect(fields.getByRole('menuitem', { name: 'Создать новое поле' })).toBeDisabled()
  await expect(fields.getByText('Пользовательские поля появятся позже')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // 2. Комментатор — только «Загрузить файл», колонки «Поля» нет
  await page.goto('/spaces/MOB')
  await page
    .getByRole('region', { name: 'Релизы', exact: true })
    .getByRole('button', { name: /^Открыть MOB-1: / })
    .click()
  const mobile = page.getByRole('dialog', { name: 'Релиз мобильного приложения' })
  await mobile.getByRole('button', { name: 'Добавить в карточку' }).click()
  expect(await menuItems(page)).toEqual(['Загрузить файл'])
  await expect(page.getByRole('menu').getByRole('group', { name: 'Поля' })).toHaveCount(0)
})
