import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { ACTIONS_ONLY_OWNER, findUser, openUsers, userRow } from './helpers'

test.use({ storageState: authFile('e2e-admin@selen.test') })

test('ТК-3.24. Обычный администратор ничего не может сделать с Владельцем @tc-3.24', async ({ page }) => {
  await openUsers(page)

  // 2. Строка Владельца: без «⋯», только значок ключа с подсказкой
  const owner = userRow(page, 'E2E Владелец')
  await expect(owner).toBeVisible()
  await expect(owner.getByRole('button', { name: 'Действия с пользователем' })).toHaveCount(0)
  // Подсказка ключа — Tooltip, а не title (LATER-85): тест проверяет видимую подсказку с причиной
  const key = owner.getByRole('link', { name: 'Доступ к пространствам' })
  await expect(key).toBeVisible()
  await key.hover()
  await expect(page.getByRole('tooltip').filter({ hasText: ACTIONS_ONLY_OWNER })).toContainText(
    'Доступ к пространствам',
  )
  await page.keyboard.press('Escape')

  // 3. «⋯» у участника: «Деактивировать» есть, «Сделать администратором» — нет. Участника тест находит поиском
  // (П2c-2): в списке 25 человек на странице, «E2E Редактор» — ближе к концу алфавита
  await findUser(page, 'E2E Редактор')
  await userRow(page, 'E2E Редактор').getByRole('button', { name: 'Действия с пользователем' }).click()
  await expect(page.getByRole('menuitem', { name: 'Деактивировать' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Сделать администратором' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // Кнопки «Передать владение» на странице нет
  await expect(page.getByRole('button', { name: 'Передать владение' })).toHaveCount(0)
})
