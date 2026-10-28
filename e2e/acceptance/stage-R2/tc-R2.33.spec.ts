import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { userRow } from '../stage-3/helpers'
import { openCompanyUsers } from './helpers'

/**
 * ТК-R2.33: в копии одной команды (ADR-0026) подписи приглашения и права «Управлять пользователями» — без гостей и
 * без учётных записей из других компаний. owner@ → e2e-owner, «Демо Участник» → «E2E Посторонний» (e2e-outsider,
 * участник «Компании 1»). Галочки не меняются. Тег @single-company — второй прогон scripts/e2e.sh. П2c-2: подпись
 * «Управлять пользователями» — «…деактивирует и возвращает сотрудников, меняет их email и завершает сеансы» (UX-ревью
 * U-4, решение PM 28.10 по отчёту «Одна компания на копию», п. 3; новые действия П2c-2).
 */
test.use({ storageState: authFile('e2e-owner@selen.test') })

const PERSON = 'E2E Посторонний'

test('ТК-R2.33. Приглашение и права компании — без гостей @tc-R2.33 @single-company', async ({ page }) => {
  // 1. «Пользователи» → «Пригласить»: текст под заголовком — без «Если у человека уже есть учётная запись в Selen…»
  await openCompanyUsers(page)
  await page.getByRole('button', { name: 'Пригласить', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Пригласить пользователя' })
  await expect(dialog).toHaveAccessibleDescription(
    'Мы отправим письмо со ссылкой: новый сотрудник сам задаст пароль (ссылка действует 72 часа).',
  )
  await expect(dialog).not.toContainText('Если у человека уже есть учётная запись в Selen')
  await dialog.getByRole('button', { name: 'Отмена' }).click()
  await expect(dialog).toBeHidden()

  // 2. Имя человека → «Права компании»: «Управлять пользователями» (без «и гостями»), подпись без «ведёт гостей»
  await userRow(page, PERSON).getByRole('link', { name: PERSON, exact: true }).click()
  await expect(page.getByRole('heading', { name: PERSON })).toBeVisible()
  const rights = page.getByRole('region', { name: 'Права компании' })
  const manageUsers = rights.getByRole('checkbox', { name: 'Управлять пользователями', exact: true })
  await expect(manageUsers).toBeVisible()
  await expect(manageUsers).toHaveAccessibleDescription(
    'видит всех сотрудников, пространства и группы компании; деактивирует и возвращает сотрудников, меняет их email и ' +
      'завершает сеансы',
  )
  await expect(rights.getByText('Управлять пользователями и гостями')).toHaveCount(0)
  await expect(rights).not.toContainText('ведёт гостей')
})
