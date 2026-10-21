import { expect, test } from '@playwright/test'
import { authFile, openBoard, openHome } from '../../tests/helpers'
import { DESKTOP, tabTo } from './helpers'

/**
 * ТК-L76.1 (LATER-76): карточка без права переноса — для экранного диктора обычная кнопка, которая открывает карточку:
 * без aria-disabled («недоступно»), без роли «sortable» и без инструкции переноса; Enter открывает её. Там, где перенос
 * разрешён, инструкция переноса есть. «Эксплуатация» → «Заявки» (Анна — комментатор) → MOB «Мобильные приложения» →
 * «Релизы» (e2e-editor — комментатор, карточка MOB-1, E2eSeeder); «Разработка» → «Продукт» (Анна — администратор) →
 * QA «Сквозные тесты» → «Процесс» (e2e-editor — редактор). Анна → e2e-editor.
 */
test.use({ storageState: authFile('e2e-editor@selen.test'), viewport: DESKTOP })

const DRAG_HINT = /Чтобы взять карточку, нажмите пробел/

test('ТК-L76.1. Карточка без права переноса — не «недоступна» для экранного диктора @tc-L76.1', async ({ page }) => {
  // 1. Пространство, где пользователь — комментатор: доска «Релизы»
  await page.goto('/spaces/MOB')
  const board = page.getByRole('region', { name: 'Релизы', exact: true })
  const card = board.getByRole('button', { name: /^Открыть MOB-1: / })

  // 2. Tab до карточки: кнопка без «недоступно» и без инструкции переноса
  await tabTo(page, card)
  await expect(card).toHaveRole('button')
  await expect(card).not.toHaveAttribute('aria-disabled')
  await expect(card).not.toHaveAttribute('aria-roledescription')
  await expect(card).not.toHaveAccessibleDescription(DRAG_HINT)

  // 3. Enter открывает карточку
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Релиз мобильного приложения').first()).toBeVisible()
  await expect(page).toHaveURL(/MOB-1/)

  // 4. Для сравнения: доска, где пользователь может переносить карточки — у карточки есть инструкция переноса
  await openHome(page)
  await openBoard(page, 'Сквозные тесты', 'Процесс')
  const movable = page.getByRole('button', { name: /^Открыть QA-1: / })
  await tabTo(page, movable)
  await expect(movable).toHaveAccessibleDescription(DRAG_HINT)
  await expect(movable).not.toHaveAttribute('aria-disabled', 'true')
})
