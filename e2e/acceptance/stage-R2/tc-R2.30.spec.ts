import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { openCompanyUsers } from './helpers'

/**
 * ТК-R2.30: в копии одной команды (ADR-0026) гостей нет — ни кнопки «Добавить гостя», ни фильтра «Гости», ни слова
 * «гости» в пояснении. owner@ → e2e-owner; «Пользователи» — первой компании («Компания 1»: у нового входа выбранной
 * компании нет). Тег @single-company — второй прогон scripts/e2e.sh (режим «одна компания»).
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-R2.30. «Пользователи»: гостей нет @tc-R2.30 @single-company', async ({ page }) => {
  // 1. «Администрирование» → «Пользователи»
  await openCompanyUsers(page)
  const main = page.getByRole('main')

  // 2. Кнопки над списком — «Передать владение» и «Пригласить»; «Добавить гостя» нет
  await expect(main.getByRole('button', { name: 'Передать владение' })).toBeVisible()
  await expect(main.getByRole('button', { name: 'Пригласить', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить гостя' })).toHaveCount(0)

  // 3. «Статус» — «Все», «Активные», «Приглашённые», «Деактивированные»; «Гости» нет
  const status = page.getByRole('combobox', { name: 'Статус' })
  await expect(status.getByRole('option')).toHaveText(['Все', 'Активные', 'Приглашённые', 'Деактивированные'])
  await expect(status.getByRole('option', { name: 'Гости' })).toHaveCount(0)

  // 4. Пояснение под вкладками — без «гостей» (прежнее — «Сотрудники и гости компании: …»)
  await expect(
    main.getByText('Сотрудники компании: роли, деактивация, доступ к пространствам и права компании.', { exact: true }),
  ).toBeVisible()
  await expect(main.getByText(/^Сотрудники и гости компании/)).toHaveCount(0)
})
