import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { companyButton, openAdminPanel, openCompanyUsers, SECOND_SPACE, THIRD_SPACE, tree } from './helpers'

/**
 * ТК-R2.31: в копии одной команды (ADR-0026) названия компании и выбора компании нет нигде. admin@ → e2e-admin
 * (администратор только «Компании 1»); «Продажи», «Поддержка», «Склад» демо — пространства других компаний E2E
 * («Вторая компания: продажи», «Третья компания: склад»). Тег @single-company — второй прогон scripts/e2e.sh.
 *
 * Шаги под Владельцем — только вручную: в базе E2E три компании (данные режима «несколько компаний»), и у e2e-owner
 * выбор компании и их названия есть — так и задумано, когда компаний в базе несколько (ADR-0026). Владельца в копии
 * одной компании закрывают Pest и Vitest (SingleCompanyMode.test.tsx).
 */
test.use({ storageState: authFile('e2e-admin@selen.test') })

test('ТК-R2.31. Названия компании и выбора компании нет нигде @tc-R2.31 @single-company', async ({ page }) => {
  // 1. Дерево слева: без заголовка с названием компании — только папки и пространства; чужих пространств нет
  await page.goto('/')
  const treeButton = page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Дерево' })
  await expect(treeButton).toBeVisible()
  if ((await treeButton.getAttribute('aria-pressed')) !== 'true') await treeButton.click()
  await expect(tree(page).getByRole('link').first()).toBeVisible()
  await expect(tree(page).getByRole('region')).toHaveCount(0)
  await expect(tree(page).getByRole('heading')).toHaveCount(0)
  await expect(page.getByText(/Компания \d/)).toHaveCount(0)
  await expect(tree(page).getByText(SECOND_SPACE)).toHaveCount(0)
  await expect(tree(page).getByText(THIRD_SPACE)).toHaveCount(0)

  // 2. «Администрирование»: выбора «Компания» нет
  const panel = await openAdminPanel(page)
  await expect(panel.getByRole('link', { name: 'Пользователи', exact: true })).toBeVisible()
  await expect(companyButton(page)).toHaveCount(0)

  // «Пользователи» → «Пригласить»: «Имя и фамилия», «Рабочий email», «Роль», доступ к пространствам; поля «Компания» нет
  await openCompanyUsers(page)
  await page.getByRole('button', { name: 'Пригласить', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })
  await expect(dialog.getByLabel('Имя и фамилия')).toBeVisible()
  await expect(dialog.getByLabel('Рабочий email')).toBeVisible()
  await expect(dialog.getByLabel('Роль', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Доступ к пространствам', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Компания', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText(/Компания \d/)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()
})
