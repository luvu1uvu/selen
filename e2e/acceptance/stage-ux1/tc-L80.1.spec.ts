import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { DESKTOP, expectHint, moveMouseAway, tabTo } from './helpers'

/**
 * ТК-L80.1 (LATER-80): «⋯» строк меток пространства и страниц администрирования — с подсказкой, название объекта
 * в «ёлочках»; подсказка и по наведению, и по фокусу Tab. «Разработка» → «Метки» → «Бэкенд» → QA «Сквозные тесты»,
 * метка «Бэкенд» (E2eSeeder). Администрирование открывает только системный администратор — e2e-admin (у Анны демо-данных
 * этого раздела нет: шаг 2 руками — под admin@selen.test).
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: DESKTOP })

async function expectMenuHint(page: Page, menu: Locator, label: string) {
  await expect(menu).toHaveAccessibleName(label)
  await menu.hover()
  await expectHint(page, label)
  await moveMouseAway(page)
  await tabTo(page, menu)
  await expectHint(page, label)
}

test('ТК-L80.1. «⋯» в метках и админке — с подсказкой и названием в «ёлочках» @tc-L80.1', async ({ page }) => {
  // 1. Пространство → вкладка «Метки» → «⋯» строки «Бэкенд»
  await page.goto('/spaces/QA')
  await page.getByRole('tab', { name: 'Метки' }).click()
  await expectMenuHint(
    page,
    page.getByRole('button', { name: 'Действия с меткой «Бэкенд»', exact: true }),
    'Действия с меткой «Бэкенд»',
  )

  // 2. Администрирование → «Пространства», «Типы карточек», «Пользователи», «Структура»: «⋯» строки
  await page.getByRole('button', { name: 'Администрирование' }).click()
  const admin = page.getByRole('navigation', { name: 'Администрирование' })
  const pages: [string, RegExp][] = [
    ['Пространства', /^Действия с пространством «Сквозные тесты»$/],
    ['Типы карточек', /^Действия с типом «[^»]+»$/],
    ['Пользователи', /^Действия с пользователем «E2E Редактор»$/],
    ['Структура', /^Действия с «Сквозные тесты»$/],
  ]
  for (const [link, label] of pages) {
    await admin.getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { name: link, level: 1 })).toBeVisible()
    const menu = page.getByRole('button', { name: label }).first()
    await expect(menu).toBeVisible()
    await expectMenuHint(page, menu, (await menu.getAttribute('aria-label'))!)
  }
})
