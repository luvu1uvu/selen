/// <reference types="node" />
import { readFileSync } from 'node:fs'

/**
 * Токены двух тем (index.css, ADR-0025): у каждого цвета светлой темы (:root) есть значение в тёмной (.dark), и пары
 * контраста «Редизайна» (design/redesign/contrast.md, шаг 1) не ниже нормы WCAG 2 AA в обеих темах — правка токена,
 * которая уронит контраст, не пройдёт `make test`. Норма 4,5 — текст, 3 — значки, рамки, границы полей, заливки
 * состояний (правила вида, раздел 11).
 */
// Файл целиком, как он лежит в репозитории: `?raw` при `css: false` (vite.config.ts) отдаёт пустую строку
const css = readFileSync(`${import.meta.dirname}/index.css`, 'utf8')

function block(selector: string) {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`нет блока ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
  return Object.fromEntries(
    [...body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name, value.trim()],
    ),
  )
}

const light = block(':root')
const dark = { ...light, ...block('.dark') }

/** Линейные sRGB 0–1 и прозрачность. Значения токенов — hex или oklch(L C H [/ A%]). */
function linear(value: string, tokens: Record<string, string>): [number, number, number, number] {
  const ref = value.match(/^var\(--([\w-]+)\)$/)
  if (ref) return linear(tokens[ref[1]], tokens)
  const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((i) => decode(parseInt(hex[1].slice(i, i + 2), 16) / 255))
    return [r, g, b, 1]
  }
  const oklch = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)%)?\)$/)
  if (!oklch) throw new Error(`непонятный цвет: ${value}`)
  const [L, C, H] = [1, 2, 3].map((i) => Number(oklch[i]))
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    oklch[4] === undefined ? 1 : Number(oklch[4]) / 100,
  ]
}

function contrast(fg: string, bg: string, tokens: Record<string, string>) {
  const luminance = (name: string) => {
    const [r, g, b, alpha] = linear(tokens[name], tokens)
    if (alpha !== 1) throw new Error(`${name} полупрозрачный — контраст не считается`)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [x, y] = [luminance(fg), luminance(bg)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// [подпись, цвет текста или знака, фон, норма]. Полоса разделов «Линии» — цвета дерева: rail = sidebar,
// rail-active = selected, rail-indicator = primary, rail-ring = ring; шапка — background
const PAIRS: [string, string, string, number][] = [
  ['основной текст на фоне окна', 'foreground', 'background', 4.5],
  ['основной текст на холсте', 'foreground', 'canvas', 4.5],
  ['основной текст на карточке', 'foreground', 'card', 4.5],
  ['основной текст на выбранной строке', 'foreground', 'selected', 4.5],
  ['основной текст в меню', 'popover-foreground', 'popover', 4.5],
  ['вторичный текст на фоне окна', 'muted-foreground', 'background', 4.5],
  ['вторичный текст на холсте', 'muted-foreground', 'canvas', 4.5],
  ['вторичный текст на доске', 'muted-foreground', 'board', 4.5],
  ['вторичный текст на полосе дорожки', 'muted-foreground', 'lane', 4.5],
  ['вторичный текст на карточке', 'muted-foreground', 'card', 4.5],
  ['вторичный текст на панели дерева', 'muted-foreground', 'sidebar', 4.5],
  ['вторичный текст на подложке muted', 'muted-foreground', 'muted', 4.5],
  ['вторичный текст при наведении accent', 'muted-foreground', 'accent', 4.5],
  ['вторичный текст на заблокированной карточке', 'muted-foreground', 'danger-surface', 4.5],
  ['вторичный текст в меню', 'muted-foreground', 'popover', 4.5],
  ['акцент текстом на фоне окна', 'primary', 'background', 4.5],
  ['акцент текстом на карточке', 'primary', 'card', 4.5],
  ['акцент текстом на выбранной строке', 'primary', 'selected', 4.5],
  ['текст главной кнопки', 'primary-foreground', 'primary', 4.5],
  ['текст вторичной кнопки', 'secondary-foreground', 'secondary', 4.5],
  ['подсказка (инверсия)', 'background', 'foreground', 4.5],
  ['ошибка, удаление на фоне окна', 'destructive', 'background', 4.5],
  ['текст кнопки «Удалить»', 'destructive-foreground', 'destructive', 4.5],
  ['«Срочно», «Заблокирована» на карточке', 'danger', 'card', 4.5],
  ['«Заблокирована» на заблокированной карточке', 'danger', 'danger-surface', 4.5],
  ['срок «просрочено»', 'danger-foreground', 'danger-muted', 4.5],
  ['сообщение об ошибке', 'danger-foreground', 'danger-surface', 4.5],
  ['срок «в срок»', 'success-foreground', 'success-muted', 4.5],
  ['сообщение об успехе', 'success-foreground', 'success-surface', 4.5],
  ['предупреждение', 'warning-foreground', 'warning-muted', 4.5],
  ['выполненный чек-лист на карточке', 'success', 'card', 4.5],
  ['значок раздела на полосе', 'muted-foreground', 'sidebar', 3],
  ['значок активного раздела полосы', 'selected-foreground', 'selected', 3],
  ['полоска выбранного к панели', 'primary', 'sidebar', 3],
  ['полоса выбранной вкладки', 'primary', 'background', 3],
  ['рамка фокуса на фоне окна', 'ring', 'background', 3],
  ['рамка фокуса на холсте', 'ring', 'canvas', 3],
  ['рамка фокуса на доске', 'ring', 'board', 3],
  ['рамка фокуса на карточке', 'ring', 'card', 3],
  ['рамка фокуса на панели дерева', 'ring', 'sidebar', 3],
  ['рамка фокуса на выбранном разделе', 'ring', 'selected', 3],
  ['рамка фокуса в меню (пункт с подложкой accent)', 'ring', 'accent', 3],
  ['рамка фокуса в меню', 'ring', 'popover', 3],
  ['граница поля на фоне окна', 'input', 'background', 3],
  ['граница поля на карточке и в форме', 'input', 'card', 3],
  ['граница поля в меню', 'input', 'popover', 3],
  ['точка «Очередь»', 'category-queue', 'board', 3],
  ['точка «В работе»', 'category-progress', 'board', 3],
  ['точка «Готово»', 'category-done', 'board', 3],
  ['полоса прогресса', 'success', 'muted', 3],
  ['рамка заблокированной карточки', 'danger-outline', 'board', 3],
]

describe('Токены тем (index.css)', () => {
  it('у каждого цвета светлой темы есть значение в тёмной', () => {
    const own = block('.dark')
    const colors = Object.keys(light).filter(
      (name) => !['radius', 'toast-success-border'].includes(name),
    )
    expect(colors.filter((name) => !(name in own))).toEqual([])
  })

  it.each([
    ['светлая', light],
    ['тёмная', dark],
  ])('%s тема: пары контраста не ниже нормы WCAG 2 AA', (_theme, tokens) => {
    const low = PAIRS.map(
      ([label, fg, bg, need]) => [label, contrast(fg, bg, tokens), need] as const,
    )
      .filter(([, value, need]) => value < need)
      .map(([label, value, need]) => `${label}: ${value.toFixed(2)} < ${need}`)
    expect(low).toEqual([])
  })

  it('расчёт совпадает с замерами contrast.md и правил вида (hex и oklch)', () => {
    expect(contrast('muted-foreground', 'background', light)).toBeCloseTo(6.04, 1)
    expect(contrast('input', 'background', light)).toBeCloseTo(3.33, 1)
    expect(contrast('input', 'background', dark)).toBeCloseTo(3.95, 1)
    expect(contrast('primary-foreground', 'primary', dark)).toBeCloseTo(6.19, 1)
    // oklch — состояния светлой темы (LATER-91)
    expect(contrast('destructive', 'background', light)).toBeCloseTo(4.77, 1)
  })

  it('карточка в тёмной теме светлее доски, доска светлее холста (решение PM 26.10, шаг 1, п. 4)', () => {
    const lum = (name: string) => {
      const [r, g, b] = linear(dark[name], dark)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(lum('card')).toBeGreaterThan(lum('board'))
    expect(lum('board')).toBeGreaterThan(lum('canvas'))
  })
})
