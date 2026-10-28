import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { openCompanyUsers } from './helpers'

/**
 * ТК-R2.43: в «Правах компании» администратора его права — отмеченные недоступные галочки с подсказкой; названия прав —
 * глаголом (решения PM по отчёту П2c-1, п. 4 и 6), пояснение — без «этой компании» (U-5). owner@ → e2e-owner, «Демо
 * Администратор» → «E2E Администратор», «Демо Участник» → «E2E Посторонний». Галочки не меняются. Тест-кейс — в режиме
 * «одна компания» (подписи без гостей и без «этой»): тег @single-company — второй прогон scripts/e2e.sh.
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const ADMIN = 'E2E Администратор'
const MEMBER = 'E2E Посторонний'

/** Права компании в режиме «одна компания» — по порядку; последнее выдаёт только Владелец, у администратора его нет. */
const NAMES = [
  'Приглашать пользователей',
  'Управлять пользователями',
  'Управлять группами',
  'Управлять справочниками (метки, типы карточек)',
  'Управлять структурой (пространства и папки)',
  'Управлять доступом ко всем пространствам компании',
  'Смотреть журнал событий',
  'Возвращать из корзины',
  'Смотреть аналитику трудозатрат',
]
const ANALYTICS = 'Смотреть аналитику трудозатрат'

test('ТК-R2.43. «Права компании» администратора и названия прав @tc-R2.43 @single-company', async ({ page }) => {
  // 1. «Пользователи» → имя администратора → «Права компании»: всё, кроме аналитики, отмечено и недоступно
  await openCompanyUsers(page)
  await userRow(page, ADMIN).getByRole('link', { name: ADMIN, exact: true }).click()
  await expect(page.getByRole('heading', { name: ADMIN })).toBeVisible()
  const rights = page.getByRole('region', { name: 'Права компании' })
  await expect(rights.getByRole('listitem').locator('label')).toHaveText(NAMES)
  for (const name of NAMES.filter((name) => name !== ANALYTICS)) {
    const box = rights.getByRole('checkbox', { name, exact: true })
    await expect(box, name).toBeChecked()
    await expect(box, name).toBeDisabled()
  }
  const analytics = rights.getByRole('checkbox', { name: ANALYTICS, exact: true })
  await expect(analytics).not.toBeChecked()
  await expect(analytics).toBeEnabled()

  // 2. Наведение на галочку «Смотреть журнал событий» — подсказка
  await rights.getByRole('group', { name: 'Смотреть журнал событий' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText(
    'Это право у администратора компании уже есть — отдельно его выдавать не нужно',
  )

  // 3. Вернуться, открыть участника: пояснение без «этой», подпись «Управлять пользователями», галочки доступны
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Пользователи', level: 1 })).toBeVisible()
  await userRow(page, MEMBER).getByRole('link', { name: MEMBER, exact: true }).click()
  await expect(page.getByRole('heading', { name: MEMBER })).toBeVisible()
  await expect(rights.getByText(/^Что сотрудник может в администрировании/)).toHaveText(
    /^Что сотрудник может в администрировании компании\./,
  )
  await expect(rights).not.toContainText('этой компании')
  await expect(rights.getByRole('checkbox', { name: 'Управлять пользователями', exact: true })).toHaveAccessibleDescription(
    'видит всех сотрудников, пространства и группы компании; деактивирует и возвращает сотрудников, меняет их email и ' +
      'завершает сеансы',
  )
  await expect(rights.getByRole('checkbox')).toHaveCount(NAMES.length)
  for (const name of NAMES) {
    await expect(rights.getByRole('checkbox', { name, exact: true }), name).toBeEnabled()
  }
})
