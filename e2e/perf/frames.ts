import type { Page } from '@playwright/test'

/**
 * Общее для замеров (make perf): счётчик кадров и моменты «щелчок» → «все карточки на экране». Для каждого действия
 * считаем самый долгий кадр (разрыв между requestAnimationFrame) — сколько интерфейс не мог перерисоваться.
 * Методика — docs/runbook.md, раздел «Производительность доски».
 */

declare global {
  interface Window {
    __expectedCards: number
    __perf: {
      frames: number[]
      marks: Record<string, number>
      readyAt: number | null
      clickAt: number | null
      treeAt: number | null
    }
  }
}

/**
 * Счётчик кадров ставится до навигации. treeLink — ссылка дерева, по появлению которой считается «дерево
 * отрисовано»; cardPrefix — начало подписи карточки: «готово», когда таких карточек на странице не меньше
 * window.__expectedCards.
 */
export async function instrument(page: Page, { treeLink, cardPrefix }: { treeLink: string; cardPrefix: string }) {
  await page.addInitScript(
    ({ treeLink, cardPrefix }) => {
      const perf = {
        frames: [] as number[],
        marks: {} as Record<string, number>,
        readyAt: null as number | null,
        clickAt: null as number | null,
        treeAt: null as number | null,
      }
      window.__perf = perf
      document.addEventListener('click', (e) => (perf.clickAt ??= e.timeStamp), { capture: true })
      const tick = (t: number) => {
        perf.frames.push(t)
        if (perf.treeAt === null && document.querySelector(`nav[aria-label="Дерево"] a[href="${treeLink}"]`)) {
          perf.treeAt = t
        }
        if (
          perf.readyAt === null &&
          window.__expectedCards &&
          document.querySelectorAll(`[aria-label^="${cardPrefix}"]`).length >= window.__expectedCards
        ) {
          perf.readyAt = t
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    { treeLink, cardPrefix },
  )
}

export const mark = (page: Page, name: string) =>
  page.evaluate((n) => (window.__perf.marks[n] = performance.now()), name)

/** Самый долгий кадр между двумя отметками. */
export function longestFrame(frames: number[], from: number, to: number): number {
  let worst = 0
  for (let i = 1; i < frames.length; i++) {
    if (frames[i] < from || frames[i - 1] > to) continue
    worst = Math.max(worst, frames[i] - frames[i - 1])
  }
  return Math.round(worst)
}

export const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

/** Сбросить отсчёт открытия перед новым переходом. */
export const resetOpen = (page: Page) =>
  page.evaluate(() => {
    window.__perf.readyAt = null
    window.__perf.clickAt = null
  })
