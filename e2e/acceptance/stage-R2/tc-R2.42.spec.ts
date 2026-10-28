import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { COMPANY_1, openCompanyUsers, usersTabs } from './helpers'

/**
 * ТК-R2.42: любое право группе «Все сотрудники» — только после подтверждения (решение PM по отчёту П2c-1, п. 3). owner@
 * → e2e-owner, «Все сотрудники» «Компании 1». Тест снимает выданное право в конце — его можно повторить (ТК-R2.25
 * выдаёт и снимает то же право).
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-R2.42. Право группе «Все сотрудники» — с подтверждением @tc-R2.42', async ({ page }) => {
  // 1. «Пользователи» → «Группы» → «Все сотрудники» → «Права компании»: отметить «Смотреть журнал событий»
  await openCompanyUsers(page, COMPANY_1)
  await usersTabs(page).getByRole('link', { name: 'Группы' }).click()
  await page.getByRole('link', { name: 'Все сотрудники', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Все сотрудники' })).toBeVisible()
  const right = page
    .getByRole('region', { name: 'Права компании' })
    .getByRole('checkbox', { name: 'Смотреть журнал событий', exact: true })
  await expect(right).not.toBeChecked()
  await right.click()
  const dialog = page.getByRole('dialog', { name: 'Выдать право всем сотрудникам?' })
  await expect(dialog).toContainText(
    'Право «Смотреть журнал событий» получат все сотрудники компании — и те, кто придёт позже',
  )

  // 2. «Отмена» — галочка не отмечена
  await dialog.getByRole('button', { name: 'Отмена', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(right).not.toBeChecked()

  // 3. Ещё раз → «Выдать всем»: галочка отмечена, «Права сохранены»
  await right.click()
  await dialog.getByRole('button', { name: 'Выдать всем' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Права сохранены')).toBeVisible()
  await expect(right).toBeChecked()

  // 4. Снять галочку — без окна: галочка снята, «Права сохранены»
  await right.click()
  await expect(dialog).toHaveCount(0)
  await expect(right).not.toBeChecked()
  await expect(page.getByText('Права сохранены').last()).toBeVisible()
  // Сохранено: после обновления страницы галочка по-прежнему снята
  await page.reload()
  await expect(right).not.toBeChecked()
})
