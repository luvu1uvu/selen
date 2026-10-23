/*
 * Цвета данных, а не интерфейса: одинаковы в любой теме, поэтому это не токены index.css. Единственный файл
 * компонентов, где разрешены hex (исключение проверки цветов — eslint.config.js, правила вида, раздел 2).
 */

/** Палитра Tailwind 500 — контрастные цвета меток и типов, различимые на светлом фоне. */
export const PALETTE = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#a855f7',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#64748b',
]

/** Фон аватаров-инициалов: у каждого цвета белые инициалы — не меньше 4,5:1 (LATER-91: три цвета 600 → 700). */
export const AVATAR_COLORS = [
  '#2563eb',
  '#15803d',
  '#b45309',
  '#9333ea',
  '#db2777',
  '#0e7490',
  '#dc2626',
  '#4b5563',
]

const WHITE = '#ffffff'
const BLACK = '#000000'

function luminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const channel = (offset: number) => {
    const value = parseInt(match[1].slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

/** Контраст двух цветов по WCAG (от 1 до 21). */
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a) ?? 1, luminance(b) ?? 1]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Цвет текста поверх цвета, который выбрал пользователь (метка, тип карточки), и на аватаре: белый или чёрный — что
 * контрастнее. С чёрным, а не почти чёрным, контраст не ниже 4,58:1 для любого цвета (решение PM 21.10 по LATER-89:
 * цвет метки — любой, текст — автоматически).
 */
export function readableTextOn(hex: string): string {
  if (luminance(hex) === null) return WHITE
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK) ? WHITE : BLACK
}
