import { expect, type Page } from '@playwright/test'
import { hex, token } from '../stage-L91/helpers'

/**
 * Общие шаги приёмочных автотестов пачки UX-2 (docs/stages/hotfix-ux-batch-2.md, «Как проверить руками»).
 *
 * Данные — E2eSeeder, а не демо-данные тест-кейсов:
 * - карточки «Разработки» → пространство UXB «Пачка UX-2», доска «Продукт» (E2eSeeder::uxBatch2): DEV-41 → UXB-1
 *   «Как DEV-41» (в Done, ответственный и заказчик — e2e-admin, чек-лист «Перед релизом», файл «скриншот-41.png»),
 *   DEV-231 → своя карточка у каждого тест-кейса, который её меняет (UXB-2…UXB-8), DEV-230 → UXB-6 «Блокирующая»;
 * - Анна (администратор «Разработки»): в окне карточки — e2e-editor (редактор UXB), где нужны права администратора
 *   доски (меню «⋯» доски, «Пользователи», переименование) — e2e-admin; Борис (ответственный, автор карточки) —
 *   e2e-admin; Вера (комментатор) — e2e-editor в MOB «Мобильные приложения» (карточка MOB-1); Владелец — e2e-owner;
 *   администратор Selen — e2e-admin;
 * - «Разработка» с досками рядами → RACC «Приёмка рядов» (устроена так же), «Компания» («доступно всем») — QA «Сквозные
 *   тесты» с пометкой «доступно всем» в подменённом ответе дерева (в E2E-данных её ни у кого нет), «Новые направления»
 *   → «E2E Пустая», длинные названия папки и доски — E2eSeeder::LONG_*.
 */

/** Ширина окна из предусловий тест-кейсов. */
export const DESKTOP = { width: 1280, height: 800 }

/** Пространство и доска карточек пачки (E2eSeeder::uxBatch2). */
export const UXB_SPACE = 'Пачка UX-2'
export const UXB_BOARD = 'Продукт'

/** Карточка DEV-41 тест-кейсов. */
export const WINDOW_CARD = { key: 'UXB-1', title: 'Как DEV-41' }

/** Открыть карточку по прямому адресу; возвращает окно карточки (его имя — название карточки). */
export async function openCardByKey(page: Page, key: string, title: string) {
  await page.goto(`/cards/${key}`)
  const window = page.getByRole('dialog', { name: title })
  await expect(window).toBeVisible()
  return window
}

/**
 * Указатель — в сторону, когда открыто окно карточки: на затемнение в левом нижнем углу (шапка приложения под окном
 * скрыта от экранного диктора — moveMouseAway из stage-ux1 её не найдёт). Ждём, пока подсказки по наведению уйдут
 * со страницы совсем (подсказка элемента в фокусе остаётся).
 */
export async function moveMouseOffWindow(page: Page) {
  const viewport = page.viewportSize()!
  await page.mouse.move(4, viewport.height - 4, { steps: 5 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const own = document.activeElement?.getAttribute('aria-describedby')
        return [...document.querySelectorAll('[role="tooltip"]')].filter((t) => t.id !== own).length
      }),
    )
    .toBe(0)
}

/** Цвет токена index.css (`--success-border`…) как #rrggbb. */
export async function tokenHex(page: Page, name: string) {
  return hex(await token(page, name))
}
