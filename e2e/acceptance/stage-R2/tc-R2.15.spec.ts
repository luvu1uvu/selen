import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCardByKey } from '../stage-ux2/helpers'
import { openAdminPanel } from './helpers'

/**
 * ТК-R2.15: глобального системного администратора больше нет — тексты по новой модели. admin@ → e2e-admin
 * (администратор «Компании 1» и пространства QA); «Разработка» → «Продукт» → карточка — QA-1 «Существующая задача»
 * по прямому адресу (удаление тест отменяет — карточка не меняется).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

const TITLE = 'Существующая задача'

test('ТК-R2.15. Тексты — «администратор компании» вместо «системного администратора» @tc-R2.15', async ({ page }) => {
  // 1. Карточка → «⋯» → «Удалить…»: вернуть её может администратор компании
  const window = await openCardByKey(page, 'QA-1', TITLE)
  await window.getByRole('button', { name: `Действия с карточкой «${TITLE}»` }).click()
  await page.getByRole('menuitem', { name: 'Удалить…' }).click()
  const confirm = page.getByRole('dialog', { name: 'Удалить QA-1?' })
  await expect(confirm).toContainText(
    'Вернуть её может администратор компании: «Администрирование» → «Корзина»',
  )
  await expect(confirm).not.toContainText(/системн/i)

  // 2. «Отмена» — карточка на месте; Администрирование → «Корзина»: описание — о карточках пространств компании
  await confirm.getByRole('button', { name: 'Отмена' }).click()
  await expect(confirm).toBeHidden()
  await expect(window).toBeVisible()
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await panel.getByRole('link', { name: 'Корзина', exact: true }).click()
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { name: 'Корзина', level: 1 })).toBeVisible()
  await expect(main).toContainText('Карточки пространств компании, удалённые в корзину')
  await expect(main).not.toContainText(/системн/i)
})
