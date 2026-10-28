import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_2, openAdminPanel } from './helpers'

/**
 * ТК-R2.26: снять администратора компании случайным нажатием нельзя. owner@ → e2e-owner; «Компания 2» → «E2E Компания
 * 2», Ирина → «E2E Админ двух компаний». Данные не меняются («Отмена»).
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const ADMIN = 'E2E Админ двух компаний'

test('ТК-R2.26. «Снять» администратора компании — с подтверждением @tc-R2.26', async ({ page }) => {
  // 1. Администрирование → «Компании» → «⋯» у второй компании → «Администраторы…»
  await page.goto('/')
  const panel = await openAdminPanel(page)
  await panel.getByRole('link', { name: 'Компании', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Компании', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: `Действия с компанией «${COMPANY_2}»` }).click()
  await page.getByRole('menuitem', { name: 'Администраторы…' }).click()
  const dialog = page.getByRole('dialog', { name: `Администраторы компании «${COMPANY_2}»` })
  const admins = dialog.getByRole('list', { name: 'Администраторы компании' })
  const row = admins.getByRole('listitem').filter({ hasText: ADMIN })
  await expect(row).toBeVisible()

  // 2. «Снять…» → окно «Снять администратора?» с текстом про вторую компанию → «Отмена»
  await row.getByRole('button', { name: 'Снять…' }).click()
  const confirm = page.getByRole('dialog', { name: 'Снять администратора?' })
  await expect(confirm).toContainText(`${ADMIN} больше не будет администратором компании «${COMPANY_2}»`)
  await confirm.getByRole('button', { name: 'Отмена' }).click()
  await expect(confirm).toBeHidden()
  // Он по-прежнему в списке администраторов — и после повторного открытия окна
  await expect(row).toBeVisible()
  await dialog.getByRole('button', { name: 'Закрыть' }).first().click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: `Действия с компанией «${COMPANY_2}»` }).click()
  await page.getByRole('menuitem', { name: 'Администраторы…' }).click()
  await expect(dialog.getByRole('list', { name: 'Администраторы компании' }).getByRole('listitem').filter({ hasText: ADMIN })).toBeVisible()
})
