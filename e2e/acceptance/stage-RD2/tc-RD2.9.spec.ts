import { expect, test, type Locator, type Page } from '@playwright/test'
import { authFile, openHome, openSpaceBoard } from '../../tests/helpers'
import { DARK } from './helpers'

/**
 * ТК-RD2.9. Срок на карточке — значок по состоянию (не только цвет): просрочено и «после срока» — календарь с крестиком,
 * «в срок» — с галочкой, срок впереди — с часами (значки lucide по имени); у карточки со сроком, «Срочно» и счётчиками
 * аватар ответственного не выходит за край — строка переносится. Значки от темы не зависят — доска DARK «Вид» (e2e-dark,
 * E2eSeeder::darkTheme): там все четыре состояния срока («Просроченная», «Готова после срока», «Готова в срок», «Полная
 * карточка») и самая полная нижняя строка — DARK-4 «Полная карточка» (срок, чек-лист, файл, комментарий, ответственный).
 * Карточки, как DEV-173 демо-данных (срок, «Срочно» и счётчики), в E2eSeeder нет — на время теста DARK-4 помечается
 * «Срочно» и в конце возвращается.
 */
test.use({ storageState: authFile(DARK.user) })

/** Изменить карточку запросом, как SPA (XSRF из cookie, X-Selen-User — пользователь сессии, ADR-0002). */
async function patchCard(page: Page, key: string, fields: Record<string, unknown>) {
  const status = await page.evaluate(
    async ({ key, fields }) => {
      const xsrf = decodeURIComponent(
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('XSRF-TOKEN='))
          ?.slice('XSRF-TOKEN='.length) ?? '',
      )
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrf,
      }
      const me = (await (await fetch('/api/v1/auth/me', { headers })).json()) as { data: { id: string } }
      const response = await fetch(`/api/v1/cards/${key}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'X-Selen-User': me.data.id },
        body: JSON.stringify(fields),
      })
      return response.status
    },
    { key, fields },
  )
  expect(status, `карточка ${key} изменена`).toBe(200)
}

/** Что из содержимого карточки выходит за правый край её фасада (за рамку и внутренний отступ). */
async function overflowRight(face: Locator) {
  return face.evaluate((root) => {
    const style = getComputedStyle(root)
    const edge = root.getBoundingClientRect().right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight)
    return [...root.querySelectorAll<HTMLElement>('*')]
      .filter((e) => !e.closest('.sr-only') && e.getBoundingClientRect().width > 0)
      .filter((e) => e.getBoundingClientRect().right > edge + 0.5)
      .map((e) => `${e.tagName.toLowerCase()} «${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30)}»`)
  })
}

test('ТК-RD2.9. Срок на карточке — значок по состоянию @tc-RD2.9', async ({ page }) => {
  await openHome(page)
  try {
    await patchCard(page, 'DARK-4', { is_urgent: true })
    await openSpaceBoard(page, DARK.space, DARK.board)
    const board = page.getByRole('region', { name: DARK.board })
    const tile = (title: string) => board.getByRole('button', { name: new RegExp(`^Открыть DARK-\\d+: ${title}$`) })

    // 1. Значок срока по состоянию
    for (const [title, state, icon, what] of [
      ['Просроченная', 'Просрочено', 'lucide-calendar-x', 'календарь с крестиком'],
      ['Готова после срока', 'Выполнено после срока', 'lucide-calendar-x', 'календарь с крестиком'],
      ['Готова в срок', 'Выполнено в срок', 'lucide-calendar-check', 'календарь с галочкой'],
      ['Полная карточка', 'Срок:', 'lucide-calendar-clock', 'календарь с часами'],
    ] as const) {
      const due = tile(title).locator(`[title^="${state}"]`)
      await expect(due, `«${title}»: срок «${state}»`).toBeVisible()
      await expect(due.locator('svg'), `«${title}»: значок — ${what}`).toHaveClass(new RegExp(`(^|\\s)${icon}(\\s|$)`))
    }

    // Карточка со сроком, «Срочно» и счётчиками: аватар ответственного не выходит за край — строка переносится
    const full = tile('Полная карточка')
    await expect(full.getByText('Срочно', { exact: true })).toBeVisible()
    await expect(full.getByRole('img', { name: /E2E Тёмная тема/ })).toBeVisible()
    expect(await overflowRight(full.locator(':scope > div')), 'ничего не выходит за край карточки').toEqual([])
    for (const title of ['Заблокированная', 'Срочная', 'Просроченная', 'Готова в срок', 'Готова после срока']) {
      expect(await overflowRight(tile(title).locator(':scope > div')), `«${title}»: ничего не выходит за край`).toEqual([])
    }
  } finally {
    await patchCard(page, 'DARK-4', { is_urgent: false })
  }
})
