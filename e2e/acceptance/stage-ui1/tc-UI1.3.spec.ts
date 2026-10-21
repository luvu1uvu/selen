import { expect, test } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { block, canvas, loaded, PRODUCT } from '../stage-layout/rows'

/**
 * ТК-UI1.3: окно — часть истории браузера. «Назад» закрывает окно (доска на прежнем месте), «Вперёд» открывает его
 * снова; после закрытия Esc «Назад» уводит на страницу, которая была до доски. «Продукт» демо-данных → RACC «Приёмка
 * рядов» → «Продукт»; Анна → e2e-editor. До доски — главная страница.
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

test('ТК-UI1.3. «Назад» закрывает окно, «Вперёд» открывает снова @tc-UI1.3', async ({ page }) => {
  await openHome(page)
  const homeUrl = page.url()
  await openSpaceBoard(page, 'Приёмка рядов', PRODUCT)
  await loaded(page, PRODUCT)
  const spaceUrl = page.url()

  // 1. Открыть карточку
  await block(page, PRODUCT)
    .getByRole('button', { name: /^Открыть RACC-\d+: Задача продукта 2$/ })
    .click()
  const window = page.getByRole('dialog', { name: 'Задача продукта 2' })
  await expect(window).toBeVisible()
  const cardUrl = page.url()
  const scroll = (await canvas(page)).scrollTop

  // 2. «Назад»: окно закрылось, доска на прежнем месте
  await page.goBack()
  await expect(window).toBeHidden()
  expect(page.url()).toBe(spaceUrl)
  expect((await canvas(page)).scrollTop).toBe(scroll)

  // 3. «Вперёд»: окно той же карточки открылось снова
  await page.goForward()
  await expect(window).toBeVisible()
  expect(page.url()).toBe(cardUrl)

  // 4. Закрыть Esc, затем «Назад» — страница до доски, карточка снова не открывается
  await page.keyboard.press('Escape')
  await expect(window).toBeHidden()
  expect(page.url()).toBe(spaceUrl)
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()
  expect(page.url()).toBe(homeUrl)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
