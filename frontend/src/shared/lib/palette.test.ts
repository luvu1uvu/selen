import { describe, expect, it } from 'vitest'
import { AVATAR_COLORS, PALETTE, contrastRatio, readableTextOn } from './palette'

/*
| Цвет текста на метках, типах и аватарах (LATER-91, решение PM 21.10 по LATER-89: цвет метки — любой, текст —
| автоматически): контраст не меньше 4,5:1 (WCAG AA) для любого цвета.
*/
describe('readableTextOn', () => {
  it('на цветах палитры меток и типов — не меньше 4,5:1; на светлых — чёрный текст', () => {
    for (const color of PALETTE)
      expect(contrastRatio(color, readableTextOn(color))).toBeGreaterThanOrEqual(4.5)
    // Белый на зелёном и жёлтом 500 — около 2:1 (было до LATER-91)
    expect(readableTextOn('#22c55e')).toBe('#000000')
    expect(readableTextOn('#f59e0b')).toBe('#000000')
    expect(readableTextOn('#64748b')).toBe('#ffffff')
  })

  it('инициалы на всех цветах аватаров — белые, не меньше 4,5:1', () => {
    for (const color of AVATAR_COLORS) {
      expect(readableTextOn(color)).toBe('#ffffff')
      expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('на любом цвете, который выберет пользователь, — не меньше 4,5:1', () => {
    const steps = [0, 0x33, 0x66, 0x80, 0x99, 0xaa, 0xcc, 0xff]
    let worst = 21
    for (const r of steps)
      for (const g of steps)
        for (let b = 0; b <= 0xff; b += 5) {
          const color = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
          worst = Math.min(worst, contrastRatio(color, readableTextOn(color)))
        }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it('неверный цвет — белый текст', () => {
    expect(readableTextOn('red')).toBe('#ffffff')
    expect(readableTextOn('#abc')).toBe('#ffffff')
  })
})
