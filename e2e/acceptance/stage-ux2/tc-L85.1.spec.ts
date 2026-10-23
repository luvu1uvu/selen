import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { ACTIONS_ONLY_OWNER, openUsers, userRow } from '../stage-3/helpers'
import { moveMouseAway, tabTo } from '../stage-ux1/helpers'
import { DESKTOP } from './helpers'

/**
 * ТК-L85.1 (LATER-85): ключ «Доступ к пространствам» в строке без меню «⋯» — подсказка Tooltip из двух строк: что
 * делает и почему меню нет; в своей строке — только «Доступ к пространствам», видна и с клавиатуры. Администратор →
 * e2e-admin («E2E Администратор»), «Демо Владелец» → «E2E Владелец».
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

const KEY = 'Доступ к пространствам'

test('ТК-L85.1. Ключ «Доступ к пространствам» — подсказка с причиной @tc-L85.1', async ({ page }) => {
  // 1. Администрирование → «Пользователи»
  await openUsers(page)

  // 2. Навести указатель на ключ в строке Владельца — подсказка из двух строк
  const ownerKey = userRow(page, 'E2E Владелец').getByRole('link', { name: KEY })
  await ownerKey.hover()
  const twoLines = page.getByRole('tooltip').filter({ hasText: ACTIONS_ONLY_OWNER })
  await expect(twoLines).toBeAttached()
  await expect(twoLines.locator('..')).toBeVisible()
  const lines = (await twoLines.innerText())
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  expect(lines).toEqual([KEY, ACTIONS_ONLY_OWNER])
  // Видимая подсказка — две строки одна под другой
  const bubble = twoLines.locator('..')
  const first = (await bubble.getByText(KEY, { exact: true }).first().boundingBox())!
  const second = (await bubble.getByText(ACTIONS_ONLY_OWNER, { exact: true }).first().boundingBox())!
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1)
  await expect(userRow(page, 'E2E Владелец').getByRole('button', { name: /^Действия с/ })).toHaveCount(0)

  // 3. Tab до ключа в своей строке — подсказка «Доступ к пространствам» без второй строки
  await moveMouseAway(page)
  const ownKey = userRow(page, 'E2E Администратор').getByRole('link', { name: KEY })
  await tabTo(page, ownKey)
  const hint = page.getByRole('tooltip', { name: KEY, exact: true })
  await expect(hint).toBeAttached()
  await expect(hint.locator('..')).toBeVisible()
  expect((await hint.innerText()).trim()).toBe(KEY)
  await expect(page.getByRole('tooltip').filter({ hasText: ACTIONS_ONLY_OWNER })).toHaveCount(0)
})
