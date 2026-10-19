/** Размер файла для показа: число и единица (подпись единицы — через i18n). */
export function sizeParts(bytes: number): { value: string; unit: 'kb' | 'mb' } {
  if (bytes < 1024 * 1024)
    return { value: String(Math.max(1, Math.round(bytes / 1024))), unit: 'kb' }
  return {
    value: (bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 }),
    unit: 'mb',
  }
}
