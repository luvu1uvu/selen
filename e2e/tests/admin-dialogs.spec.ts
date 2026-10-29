import { expect, test, type Locator } from '@playwright/test'
import { pageAs } from './helpers'

/**
 * Окна админки (UX-ревью П2c-1; docs/ui-guidelines.md, разделы 4 и 11): окно не выше экрана — прокручивается его
 * содержимое, и кнопка отправки достижима (U-1); после «Добавить папку или пространство» (П2d-1: строка — папка или
 * пространство и роли чипами) фокус на поле новой строки, после × — на × соседней строки (U-2), у × — название (U-6).
 * Jsdom раскладку не считает — поэтому E2E.
 */
test('«Пригласить» с шестью строками доступа помещается в экран 1280×720; фокус не теряется', async ({ browser }) => {
  const page = await pageAs(browser, 'e2e-owner@selen.test')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/admin/users')
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Пригласить' }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })

  const spaces = dialog.getByRole('combobox', { name: 'Папка или пространство', exact: true })
  for (let row = 0; row < 6; row++) {
    await dialog.getByRole('button', { name: 'Добавить папку или пространство' }).click()
    await expect(spaces.nth(row)).toBeFocused()
  }

  const box = await dialog.boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(720)
  const submit = dialog.getByRole('button', { name: 'Отправить приглашение' })
  await submit.scrollIntoViewIfNeeded()
  await expect(submit).toBeInViewport()

  // × второй строки с клавиатуры: строка убрана, фокус — на × следующей (теперь второй) строки, в подписи — пространство
  const removes = dialog.getByRole('button', { name: /^Убрать «.+»$/ })
  // Название в подписи × — без отступа уровня дерева, который есть в тексте пункта списка
  const third = (await spaces.nth(2).locator('option:checked').textContent())?.trim()
  await removes.nth(1).focus()
  await page.keyboard.press('Enter')
  await expect(removes).toHaveCount(5)
  await expect(removes.nth(1)).toBeFocused()
  await expect(removes.nth(1)).toHaveAccessibleName(`Убрать «${third}»`)
})

/**
 * «Доступ…» (UX-ревью П2d-1): фокус при открытии — в поиске сотрудника (U-5); выбор роли и «Сотруднику / Группе» не
 * сдвигает ни один чип и кнопку «Выдать доступ» — место галочки и жирность заняты у всех чипов, описание роли — в
 * подсказке, а не строкой под чипами (U-1). Положение — относительно группы чипов: окно может прокрутиться.
 */
test('«Доступ…»: фокус в поиске; чипы ролей при выборе не сдвигаются', async ({ browser }) => {
  const page = await pageAs(browser, 'e2e-owner@selen.test')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/admin/structure')
  await expect(page.getByRole('heading', { name: 'Структура', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Действия с «E2E Продуктовые команды»' }).click()
  await page.getByRole('menuitem', { name: 'Доступ…', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Доступ: E2E Продуктовые команды' })
  await expect(dialog.getByRole('textbox', { name: 'Сотрудник' })).toBeFocused()
  // Список сотрудников под поиском подгружается и сдвигает форму — замер после него
  await expect(dialog.getByRole('button', { name: /e2e-owner@selen\.test/ })).toBeVisible()

  const roles = dialog.getByRole('group', { name: 'Роли' })
  const kinds = dialog.getByRole('group', { name: 'Кому' })
  const submit = dialog.getByRole('button', { name: 'Выдать доступ' })
  const layout = async () => {
    const origin = (await roles.boundingBox())!
    const place = async (element: Locator) => {
      const box = (await element.boundingBox())!
      return { x: box.x - origin.x, y: box.y - origin.y, width: box.width }
    }
    return {
      chips: await Promise.all((await roles.getByRole('button').all()).map(place)),
      kinds: await Promise.all((await kinds.getByRole('button').all()).map(place)),
      submit: (await place(submit)).y,
    }
  }

  const before = await layout()
  await roles.getByRole('button', { name: 'Комментатор', exact: true }).click()
  await roles.getByRole('button', { name: 'Администратор', exact: true }).click()
  await expect(roles.getByRole('button', { pressed: true })).toHaveCount(3)
  expect(await layout()).toEqual(before)

  // Все роли сняты — ни одной галочки, раскладка та же
  for (const name of ['Администратор', 'Редактор', 'Комментатор'])
    await roles.getByRole('button', { name, exact: true }).click()
  await expect(roles.getByRole('button', { pressed: true })).toHaveCount(0)
  expect(await layout()).toEqual(before)
})
