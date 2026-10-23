import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Цвета уведомлений — токены index.css (правила вида, раздел 7, «Уведомление»): обычное — `popover`, успех и ошибка —
 * поверхность, граница и текст состояния (emerald / red 50, 200, 800; не меньше 4,5:1, LATER-103). Свои цвета sonner
 * (`richColors`) — 4,26:1 и 4,35:1. Переменные — в `style`: стили sonner вне слоёв Tailwind, классы их не перебивают.
 * Шрифт — как у всего приложения (`--font-sans`), а не свой набор sonner (LATER-111).
 */
const colors = {
  fontFamily: 'var(--font-sans)',
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--success-bg': 'var(--success-surface)',
  '--success-text': 'var(--success-foreground)',
  // Не var(--success-border): у sonner переменная того же имени — ссылка на себя недействительна (LATER-111)
  '--success-border': 'var(--toast-success-border)',
  '--error-bg': 'var(--danger-surface)',
  '--error-text': 'var(--danger-foreground)',
  '--error-border': 'var(--danger-border)',
} as CSSProperties

/**
 * Уведомления справа сверху. Поверх модального окна они нажимаются (LATER-102): Radix выключает указатель у всего вне
 * окна (`pointer-events: none` у body), а щелчок по уведомлению окно само не считает щелчком мимо (`CardWindow`).
 * Текст — `text-sm`; подписи области и «×» для экранного диктора — по-русски.
 */
function Toaster(props: ToasterProps) {
  const { t } = useTranslation()
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      className="pointer-events-auto"
      style={colors}
      customAriaLabel={t('toasts.region')}
      toastOptions={{
        closeButtonAriaLabel: t('toasts.close'),
        style: { fontSize: 'var(--text-sm)' },
      }}
      {...props}
    />
  )
}

export { Toaster }
