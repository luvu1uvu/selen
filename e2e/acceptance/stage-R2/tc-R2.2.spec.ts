import { expect, test, type Page } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { GROUPS, openMembers, ROLES } from './helpers'

/**
 * ТК-R2.2: «только свои карточки» теперь — часть роли; подрядчик по-прежнему видит и меняет только свои карточки.
 * Жанна — e2e-restricted: «Разработка» → RROLES «Права: роли» (лично «Редактор — только свои карточки»; свои —
 * RROLES-3, где он ответственный, и RROLES-4, где участник; чужие — RROLES-1, -2, -5), «Эксплуатация» → RGROUPS
 * «Права: группы» (через группу «E2E Подрядчики»; своя — RGROUPS-1, чужая — RGROUPS-2), E2eSeeder::rights2.
 */
test.use({ storageState: authFile('e2e-restricted@selen.test') })

const cards = (page: Page, key: string) =>
  page.getByRole('button', { name: new RegExp(`^Открыть ${key}-\\d+: `) })

test('ТК-R2.2. «Только свои карточки» работает как раньше @tc-R2.2', async ({ page }) => {
  // 1. «Продукт»: только свои карточки (ответственный или участник), чужих нет
  await openHome(page)
  await openBoard(page, ROLES, 'Продукт')
  await expect(page.getByRole('button', { name: 'Открыть RROLES-3: Задача подрядчика' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Открыть RROLES-4: Подрядчик — участник' })).toBeVisible()
  await expect(cards(page, 'RROLES')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Открыть RROLES-(1|2|5): / })).toHaveCount(0)

  // 2. Открыть карточку, изменить название — меняется
  await page.getByRole('button', { name: 'Открыть RROLES-3: Задача подрядчика' }).click()
  const title = page.getByRole('dialog').getByRole('textbox', { name: 'Название' })
  await title.fill('Задача подрядчика (изменена)')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Сохранено')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Название' })).toHaveValue(
    'Задача подрядчика (изменена)',
  )

  // 3. «Участники»: люди видны, роли и группы — нет
  await openHome(page)
  await openMembers(page, ROLES)
  const panel = page.getByRole('tabpanel', { name: 'Участники' })
  for (const name of ['E2E Администратор', 'E2E Редактор', 'E2E Руководитель']) {
    await expect(panel.getByText(name, { exact: true }), name).toBeVisible()
  }
  await expect(panel.getByRole('columnheader', { name: 'Личная роль' })).toHaveCount(0)
  await expect(panel.getByRole('columnheader', { name: 'Доступ' })).toHaveCount(0)
  await expect(panel.getByRole('combobox')).toHaveCount(0)
  await expect(panel.getByText(/^(Лично:|Администратор|Редактор|Комментатор)/)).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Группы' })).toHaveCount(0)
  await expect(page.getByText('E2E Руководители')).toHaveCount(0)

  // 4. «Эксплуатация» → «Заявки»: только карточка, где подрядчик ответственный
  await openBoard(page, GROUPS, 'Заявки')
  await expect(page.getByRole('button', { name: 'Открыть RGROUPS-1: Заявка подрядчика' })).toBeVisible()
  await expect(cards(page, 'RGROUPS')).toHaveCount(1)
  await expect(page.getByText('Чужая заявка')).toHaveCount(0)
})
