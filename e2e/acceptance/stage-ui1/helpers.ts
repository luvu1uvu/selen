import { expect, type Locator, type Page } from '@playwright/test'
import { openBoard, openHome } from '../../tests/helpers'

/**
 * Общие шаги приёмочных автотестов подэтапа UI-1a — окно карточки (docs/stages/ui-1.md, «Тест-кейсы UI-1a»,
 * ТК-UI1.1–UI1.25).
 *
 * Данные — E2eSeeder: доска «Продукт» демо-данных → пространство WIN «Окно карточки», доска «Окно» (у каждого
 * тест-кейса, который меняет карточку, своя карточка — E2eSeeder::cardWindow); где важна страница пространства
 * с высокой доской (ТК-UI1.1–UI1.4) — RACC «Приёмка рядов», доска «Продукт» (её тесты только смотрят). Анна
 * (администратор «Разработки», не системный администратор) — e2e-editor (editor в WIN и RACC), системный
 * администратор — e2e-admin, Вера (комментатор) — e2e-editor в MOB «Мобильные приложения» (карточка MOB-1), Жанна
 * («только свои карточки») — e2e-restricted.
 */

export const SPACE = 'Окно карточки'
export const BOARD = 'Окно'

/** Минимальный PNG 1×1 — «картинка с компьютера». */
export const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/**
 * Плитка карточки WIN на доске по названию. По подписи, а не по роли: под открытым окном доска скрыта от экранного
 * диктора (aria-hidden), а плитку проверяем и тогда.
 */
export const tile = (page: Page, title: string) =>
  page.locator(`[aria-label^="Открыть WIN-"][aria-label$=": ${title}"]`)

/** Доска «Окно» пространства «Окно карточки» — отдельной страницей (/boards/ID), как из ссылки на доску. */
export async function openWinBoard(page: Page) {
  await openHome(page)
  await openBoard(page, SPACE, BOARD)
}

/** Открыть карточку щелчком по плитке на доске «Окно»; возвращает окно карточки (его имя — название карточки). */
export async function openCard(page: Page, title: string) {
  await openWinBoard(page)
  await tile(page, title).click()
  const window = page.getByRole('dialog', { name: title })
  await expect(window).toBeVisible()
  await expect(page).toHaveURL(/\/cards\/WIN-\d+$/)
  return window
}

/** Значение поля «Основных параметров» (строка «название — значение»: dt и следующий за ним dd). */
export const param = (window: Locator, name: string) =>
  window.locator('dt', { hasText: name }).locator('xpath=following-sibling::dd[1]')

/** Пункты открытого меню (DropdownMenu Radix) — в порядке на экране. */
export async function menuItems(page: Page) {
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  return menu.getByRole('menuitem').allTextContents()
}

/**
 * Запоминать каждое появившееся уведомление (sonner): так видно, что после действия пришло новое «Сохранено», а не
 * висит прежнее.
 */
export async function trackToasts(page: Page) {
  await page.evaluate(() => {
    const store = window as unknown as { __toasts: string[] }
    store.__toasts = []
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const toasts = node.matches('[data-sonner-toast]')
            ? [node]
            : [...node.querySelectorAll<HTMLElement>('[data-sonner-toast]')]
          toasts.forEach((toast) => store.__toasts.push(toast.textContent ?? ''))
        }
      }
    }).observe(document.body, { childList: true, subtree: true })
  })
}

/** Сколько уведомлений уже было (отметка для toastsSince). */
export const toastCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts.length)
/** Тексты уведомлений, появившихся после отметки toastCount. */
export const toastsSince = (page: Page, from: number) =>
  page.evaluate((from) => (window as unknown as { __toasts: string[] }).__toasts.slice(from), from)

/** После действия появилось новое уведомление с этим текстом (нужен trackToasts). */
export async function expectNewToast(page: Page, text: string, action: () => Promise<unknown>) {
  const from = await toastCount(page)
  await action()
  await expect
    .poll(() => toastsSince(page, from), { message: `уведомление «${text}»` })
    .toContain(text)
}

/**
 * Перехватить копирование в буфер обмена: E2E-стек открыт по http://nginx (не «надёжный» адрес), и
 * navigator.clipboard в браузере нет. Скопированное — в window.__copied (copiedText).
 */
export async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { __copied: string }).__copied = text
        },
      },
    })
  })
}

export const copiedText = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? null)

/**
 * Перетащить файл из компьютера на элемент: события перетаскивания с DataTransfer, в котором PNG (настоящий перенос
 * файла из папки Playwright сделать не может). `onEnter` — проверка, пока файл над окном.
 */
export async function dropFile(
  page: Page,
  target: Locator,
  name: string,
  onEnter?: () => Promise<void>,
) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], name, { type: 'image/png' }))
      return transfer
    },
    { name, base64: PNG_BASE64 },
  )
  await target.dispatchEvent('dragenter', { dataTransfer })
  await onEnter?.()
  await target.dispatchEvent('dragover', { dataTransfer })
  await target.dispatchEvent('drop', { dataTransfer })
}

/** Подпись или текст элемента в фокусе и внутри ли он окна карточки. */
export const focusedInWindow = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null
    return {
      name:
        active?.getAttribute('aria-label') ??
        active?.getAttribute('role') ??
        active?.textContent?.trim() ??
        '',
      inWindow: !!active?.closest('[data-card-window]'),
    }
  })
