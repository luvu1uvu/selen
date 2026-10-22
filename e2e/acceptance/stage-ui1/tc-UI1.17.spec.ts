import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCard, tile } from './helpers'

/**
 * ТК-UI1.17: системный администратор удаляет карточку в корзину из «⋯» окна: окно закрылось, уведомление, карточки на
 * доске нет; в «Администрирование» → «Корзина» — она там. Карточка → WIN-13 «Удаляется в корзину» (E2eSeeder);
 * admin@selen.test → e2e-admin.
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const TITLE = 'Удаляется в корзину'

test('ТК-UI1.17. Удаление в корзину — только системному администратору @tc-UI1.17', async ({
  page,
}) => {
  // 1. Открыть карточку → «⋯» → «Удалить…» → подтвердить
  const window = await openCard(page, TITLE)
  const key = page.url().match(/WIN-\d+$/)![0]
  await window.getByRole('button', { name: `Действия с карточкой «${TITLE}»` }).click()
  await page.getByRole('menuitem', { name: 'Удалить…' }).click()
  const confirm = page.getByRole('dialog', { name: `Удалить ${key}?` })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Удалить', exact: true }).click()

  // Окно закрылось, уведомление об удалении, карточки на доске нет
  await expect(window).toBeHidden()
  await expect(page.getByText('Карточка удалена в корзину')).toBeVisible()
  await expect(tile(page, TITLE)).toHaveCount(0)

  // «Администрирование» → «Корзина» — карточка там
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('link', { name: 'Корзина' }).click()
  await expect(page.getByRole('heading', { name: 'Корзина' })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: key })
  await expect(row).toContainText(TITLE)
  await expect(row).toContainText('Окно карточки')
})
