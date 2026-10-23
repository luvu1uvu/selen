import { expect, test } from '@playwright/test'
import { authFile } from '../../tests/helpers'
import { param } from '../stage-ui1/helpers'
import { avatarsIn, COLORS, contrast, hex, openCard, openThemeBoard } from './helpers'

/**
 * ТК-L91.6 (LATER-91): инициалы на аватарах читаются — белые, не меньше 4,5:1 к фону аватара; прежних цветов
 * с белыми инициалами 3,2–3,7:1 (#16a34a, #d97706, #0891b2 — теперь 700) нет. Цвет аватара зависит от id человека
 * (случайного при каждом заполнении базы), поэтому проверяются все аватары на доске и в списке ответственных. Доска
 * «Продукт» → «Вид» пространства THEME (E2eSeeder::themePrep: ответственные — четыре участника пространства), Анна →
 * e2e-editor; список ответственных — у карточки без ответственного «Для новой метки» (тест его только открывает).
 */
test.use({ storageState: authFile('e2e-editor@selen.test') })

type Avatar = Awaited<ReturnType<typeof avatarsIn>>[number]

function expectReadable(avatars: Avatar[], where: string) {
  for (const avatar of avatars) {
    const what = `${where}: ${avatar.name} (${hex(avatar.background)})`
    expect(hex(avatar.text), `${what} — белые инициалы`).toBe(COLORS.white)
    expect(contrast(avatar.text, avatar.background), `${what} — контраст`).toBeGreaterThanOrEqual(4.5)
    expect(COLORS.oldAvatars, `${what} — прежний бледный цвет`).not.toContain(hex(avatar.background))
  }
}

test('ТК-L91.6. Инициалы на аватарах читаются @tc-L91.6', async ({ page }) => {
  // 1. Доска — аватары ответственных внизу карточек
  await openThemeBoard(page)
  const onBoard = await avatarsIn(page.locator('[data-board-body]'))
  expect(new Set(onBoard.map((a) => a.name)).size, 'аватары четырёх ответственных').toBe(4)
  expectReadable(onBoard, 'доска')

  // 2. Карточка → «Ответственный» — список людей с аватарами
  const card = await openCard(page, 'Для новой метки')
  await param(card.getByRole('region', { name: 'Основные параметры' }), 'Ответственный')
    .getByRole('button')
    .click()
  const list = page.getByRole('listbox')
  // Первый пункт списка появляется раньше людей: при полном прогоне make e2e аватаров в нём ещё не было (0) — ждём их
  await expect
    .poll(async () => (await avatarsIn(list)).length, { message: 'аватары в списке ответственных' })
    .toBeGreaterThanOrEqual(4)
  const inList = await avatarsIn(list)
  expectReadable(inList, 'список ответственных')
  await page.keyboard.press('Escape')
})
