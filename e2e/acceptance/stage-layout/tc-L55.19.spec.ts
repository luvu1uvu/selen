import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, DUTY, INFRA, layout, loaded, openSpace, PRODUCT, START_LAYOUT, WIDE } from './rows'

/**
 * ТК-L55.19 (LATER-55; решение PM 5): архивная доска пропадает со страницы пространства; в окне «Архив досок» — она
 * и кнопка «Восстановить»; по названию открывается отдельная страница доски только для чтения («Доска в архиве:
 * доступна только для чтения», в шапке — «Пространство / Доска»); восстановленная доска встаёт на своё прежнее место.
 * «Разработка» демо-данных → RARCH «Архивные доски приёмки» (E2eSeeder), Анна → e2e-admin. В конце доска восстановлена.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RARCH', 'Архивные доски приёмки'] as const

test('ТК-L55.19. Архив досок и страница одной доски @tc-L55.19', async ({ page }) => {
  await openSpace(page, ...SPACE)
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)

  // 1. «⋯» в шапке «Дежурства» → «Архивировать доску…» → «Архивировать»
  await block(page, DUTY).getByRole('button', { name: `Действия с доской «${DUTY}»` }).click()
  await page.getByRole('menuitem', { name: 'Архивировать доску…' }).click()
  const confirm = page.getByRole('dialog', { name: 'Архивировать доску?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Архивировать', exact: true }).click()
  // «Дежурства» пропала со страницы, «Широкая доска» — первая в ряду
  await expect(block(page, DUTY)).toHaveCount(0)
  await expect.poll(() => layout(page)).toEqual([[WIDE], [PRODUCT], [INFRA]])

  // 2. «Архив досок» на панели — в окне «Дежурства» и «Восстановить»
  await page.getByRole('button', { name: 'Архив досок', exact: true }).click()
  const archive = page.getByRole('dialog', { name: 'Архив досок' })
  await expect(archive).toBeVisible()
  await expect(archive.getByRole('link', { name: DUTY, exact: true })).toBeVisible()
  await expect(archive.getByRole('button', { name: 'Восстановить' })).toHaveCount(1)

  // 3. Нажать «Дежурства» в окне — страница одной доски, только для чтения
  await archive.getByRole('link', { name: DUTY, exact: true }).click()
  await expect(page).toHaveURL(/\/boards\/[0-9a-z]+$/)
  await expect(page.getByText('Доска в архиве: доступна только для чтения')).toBeVisible()
  const crumbs = page.getByRole('heading', { name: DUTY, level: 1 }).locator('..')
  await expect(crumbs).toContainText(new RegExp(`${SPACE[1]}\\s*/\\s*${DUTY}`))
  await expect(crumbs.getByRole('link', { name: SPACE[1], exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Открыть RARCH-\d+: Дежурство \d$/ })).toHaveCount(6)

  // 4. Нажать «Архивные доски приёмки» перед названием доски; снова «Архив досок» → «Восстановить»
  await crumbs.getByRole('link', { name: SPACE[1], exact: true }).click()
  await expect(page).toHaveURL(/\/spaces\/RARCH$/)
  await page.getByRole('button', { name: 'Архив досок', exact: true }).click()
  await expect(archive).toBeVisible()
  await archive.getByRole('button', { name: 'Восстановить' }).click()
  await expect(archive.getByText('Архивных досок нет')).toBeVisible()
  await page.keyboard.press('Escape')
  // «Дежурства» снова на своём месте — первой в первом ряду, слева от «Широкой доски»
  await expect.poll(() => layout(page)).toEqual(START_LAYOUT)
  await loaded(page, DUTY)
})
