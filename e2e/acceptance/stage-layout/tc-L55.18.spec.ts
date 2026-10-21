import { expect, test } from '@playwright/test'
import { authFile, openSpaceBoard } from '../../tests/helpers'
import { LAPTOP } from './helpers'
import { block, canvas, collapseButton, expandButton, INFRA, loaded, openSpace, rect, scrollToBoard } from './rows'

/**
 * ТК-L55.18 (LATER-55; решение PM 3): клик по доске в дереве открывает страницу пространства, прокрученную так, что
 * доска — у верха под панелью, и раскрывает её, даже если она была свёрнута; в дереве выделена доска, а не
 * пространство; сворачивание снято насовсем — и на странице пространства без адреса доски она развёрнута.
 * «Разработка» демо-данных → RFOLD «Сворачивание приёмки» (E2eSeeder; «Инфраструктура» — 15 карточек, выше экрана, как
 * в демо-данных: последняя доска короче экрана к верху холста не встала бы — дальше холсту некуда прокручиваться),
 * Анна → e2e-admin. В конце доска развёрнута.
 */
test.use({ storageState: authFile('e2e-admin@selen.test'), viewport: LAPTOP })

const SPACE = ['RFOLD', 'Сворачивание приёмки'] as const
const INFRA_CARDS = /^Открыть RFOLD-\d+: Инфраструктура: /

test('ТК-L55.18. Клик по доске в дереве — раскрывает её и прокручивает к ней @tc-L55.18', async ({ page }) => {
  // 1. Свернуть «Инфраструктура» (˄)
  await openSpace(page, ...SPACE)
  await scrollToBoard(page, INFRA, 16)
  await loaded(page, INFRA)
  await collapseButton(page, INFRA).click()
  await expect(expandButton(page, INFRA)).toHaveAttribute('aria-expanded', 'false')
  await expect(block(page, INFRA).getByRole('button', { name: INFRA_CARDS })).toHaveCount(0)

  // 2. На главную (значок «S» слева вверху)
  await page.getByRole('link', { name: 'Главная' }).click()
  await expect(page.getByRole('heading', { name: 'Пространства' })).toBeVisible()

  // 3. Дерево → «Сворачивание приёмки» → «Инфраструктура»
  await openSpaceBoard(page, SPACE[1], INFRA)
  await expect(page).toHaveURL(/\/spaces\/RFOLD\?board=/)
  await loaded(page, INFRA)
  // Страница прокручена: «Инфраструктура» — у верха холста под панелью. Отступ — зазор между строками ряда (12 px), а не
  // поле холста (16 px): при поле над доской торчала полоска 4 px доски выше (решение PM 20.10, пачка LATER-74)
  const space = await canvas(page)
  await expect.poll(async () => Math.abs((await rect(page, INFRA)).top - space.top - 12)).toBeLessThanOrEqual(2)
  expect((await canvas(page)).scrollTop).toBeGreaterThan(500)
  // Доска развёрнута, карточки видны
  await expect(collapseButton(page, INFRA)).toHaveAttribute('aria-expanded', 'true')
  await expect(block(page, INFRA).getByRole('button', { name: INFRA_CARDS })).toHaveCount(15)
  for (const column of ['To Do', 'In Progress', 'Done'])
    await expect(block(page, INFRA).getByRole('button', { name: new RegExp(`: Инфраструктура: ${column}$`) })).toBeInViewport()
  // В дереве выделена «Инфраструктура», а не пространство
  const tree = page.getByRole('navigation', { name: 'Дерево' })
  await expect(tree.getByRole('link', { name: INFRA, exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(tree.getByRole('link', { name: new RegExp(`^${SPACE[1]}`) })).not.toHaveAttribute('aria-current')

  // 4. Без адреса доски: Дерево → «Сворачивание приёмки» и обновить страницу — «Инфраструктура» по-прежнему развёрнута
  await tree.getByRole('link', { name: new RegExp(`^${SPACE[1]}`) }).click()
  await expect(page).toHaveURL(/\/spaces\/RFOLD$/)
  await page.reload()
  await expect(page.getByRole('heading', { name: SPACE[1], level: 1 })).toBeVisible()
  await scrollToBoard(page, INFRA, 16)
  await loaded(page, INFRA)
  await expect(collapseButton(page, INFRA)).toHaveAttribute('aria-expanded', 'true')
  await expect(block(page, INFRA).getByRole('button', { name: INFRA_CARDS })).toHaveCount(15)
})
