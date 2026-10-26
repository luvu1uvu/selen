import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'

// Вместо OPS «Эксплуатация» — QA «Сквозные тесты» E2eSeeder: у e2e-owner в нём нет роли.
// С «Прав 2.0», П2b-2 ссылка на недоступное ведёт на главную с уведомлением (вместо страницы «Пространство не найдено»):
// одинаково для «нет доступа» и «нет такого» — проверка та же, Владелец содержимого не видит.
test.use({ storageState: authFile('e2e-owner@selen.test') })

test('ТК-3.32. Владелец не видит содержимое пространства без роли в нём @tc-3.32', async ({ page }) => {
  // 1. Прямой адрес пространства: главная и «нет доступа», досок и карточек не видно
  await page.goto('/spaces/QA')
  await expect(page.getByText('Нет доступа к пространству или оно не существует')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Процесс')).toHaveCount(0)
  await expect(page.getByText('Существующая задача')).toHaveCount(0)

  // 2. «Администрирование» → «Пространства»: пространство есть — название, ключ, администраторы
  await page.getByRole('button', { name: 'Администрирование' }).click()
  await page.getByRole('link', { name: 'Пространства' }).click()
  await expect(page.getByRole('heading', { name: 'Пространства', level: 1 })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: 'Сквозные тесты' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('QA')
  await expect(row).toContainText('E2E Администратор')
})
