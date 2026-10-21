import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Общие шаги приёмочных автотестов пачки хотфиксов UX-1 (docs/stages/hotfix-ux-batch-1.md, ТК-L74.*, ТК-L75.1–L80.1).
 * Данные — E2eSeeder: «Разработка» демо-данных → пространства RACC «Приёмка рядов» и RFOLD «Сворачивание приёмки»
 * (устроены так же), доска «Продукт» → «Длинная доска», «Длинные названия», «Дорожки приёмки» (LAYOUT «Раскладка»),
 * «Эксплуатация» → MOB «Мобильные приложения» (e2e-editor — комментатор). Анна (администратор «Разработки») —
 * e2e-admin, Борис (редактор) — e2e-editor.
 */

/** Ширины окна из предусловий тест-кейсов. */
export const DESKTOP = { width: 1280, height: 800 }
export const LAPTOP = { width: 1440, height: 900 }

/**
 * Подсказка Tooltip видна человеку: есть элемент с ролью tooltip и этим текстом, а сама всплывающая подсказка
 * (её блок — родитель скрытой копии для экранного диктора) видна и занимает место на экране.
 */
export async function expectHint(page: Page, text: string) {
  const tooltip = page.getByRole('tooltip', { name: text, exact: true })
  await expect(tooltip).toBeAttached()
  const bubble = tooltip.locator('..')
  await expect(bubble).toBeVisible()
  expect((await bubble.boundingBox())?.width ?? 0).toBeGreaterThan(20)
}

/** Подсказки с этим текстом нет (подождав задержку показа). */
export async function expectNoHint(page: Page, text: string) {
  await page.waitForTimeout(800)
  await expect(page.getByRole('tooltip', { name: text, exact: true })).toHaveCount(0)
}

/**
 * Указатель — в сторону, на пустое место шапки приложения: подсказки по наведению закрываются. Ждём, пока закрытая
 * подсказка уйдёт со страницы совсем (анимация закрытия): та же подсказка, открытая снова, пока прежняя ещё исчезает,
 * Radix сразу же закрывает — человек так быстро не успеет, а скрипт успевает. Подсказка элемента в фокусе остаётся.
 */
export async function moveMouseAway(page: Page) {
  const header = (await page
    .locator('header')
    .filter({ has: page.getByRole('button', { name: 'Меню пользователя' }) })
    .boundingBox())!
  await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2, { steps: 5 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const own = document.activeElement?.getAttribute('aria-describedby')
        return [...document.querySelectorAll('[role="tooltip"]')].filter((t) => t.id !== own).length
      }),
    )
    .toBe(0)
}

/**
 * Дойти до элемента клавишей Tab: фокус ставится на элемент перед ним в порядке Tab, затем нажимается Tab — фокус
 * приходит с клавиатуры (как у человека), и элемент действительно следующий в порядке обхода.
 */
export async function tabTo(page: Page, target: Locator) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await moveMouseAway(page)
  await target.evaluate((element) => {
    const tabbable = [
      ...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]'),
    ].filter(
      (e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).disabled && e.getClientRects().length > 0,
    )
    const index = tabbable.indexOf(element as HTMLElement)
    if (index < 1) throw new Error('Перед элементом нет ничего, на что можно перейти клавишей Tab')
    tabbable[index - 1].focus({ preventScroll: true })
  })
  await page.keyboard.press('Tab')
  await expect(target).toBeFocused()
}

/** Подпись или текст элемента в фокусе. */
export const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')

/** Текст не помещается в элемент (обрезан многоточием). */
export const isTruncated = (locator: Locator) => locator.evaluate((e) => e.scrollWidth > e.clientWidth)

/** Заголовок колонки в строке заголовков доски: название, точка категории, счётчик, «+», «⋯». */
export function columnHeader(page: Page, name: string) {
  return page
    .locator('[data-board-columns] div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: `Действия с колонкой «${name}»` }) })
    .last()
}
