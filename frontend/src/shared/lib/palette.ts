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

/**
 * Цвет текста поверх цвета, который выбрал пользователь (тип карточки): белый на тёмном, почти чёрный на светлом —
 * по относительной яркости WCAG (белая буква на жёлтом или зелёном 500 — около 2:1).
 */
export function readableTextOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return '#ffffff'
  const channel = (offset: number) => {
    const value = parseInt(match[1].slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  // Порог, при котором контраст с белым и с почти чёрным (#0a0a0a) одинаков
  return luminance > 0.18 ? '#0a0a0a' : '#ffffff'
}
