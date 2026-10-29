/**
 * Короткое имя браузера и системы по строке User-Agent для журнала событий (П2c-2, решение PM 28.10): «Chrome 131 ·
 * macOS». Полная строка — в подсказке. Порядок проверок важен: Edge, Opera и Яндекс.Браузер притворяются Chrome, Chrome —
 * Safari. Не распознали — null (покажем «Неизвестный браузер» и полную строку в подсказке). Названия браузеров и систем —
 * имена продуктов, их не переводят: поэтому здесь, а не в locales (осознанное исключение из правила i18n).
 */
const BROWSERS: [name: string, pattern: RegExp][] = [
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['Opera', /(?:OPR|Opera)\/(\d+)/],
  ['Яндекс.Браузер', /YaBrowser\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//],
]

const SYSTEMS: [name: string, pattern: RegExp][] = [
  ['Windows', /Windows NT/],
  ['Android', /Android/],
  ['iOS', /iPhone|iPad|iPod/],
  ['macOS', /Mac OS X|Macintosh/],
  ['Linux', /Linux|X11/],
]

export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  const browser = BROWSERS.map(([name, pattern]) => {
    const match = pattern.exec(userAgent)
    return match ? `${name} ${match[1]}` : null
  }).find(Boolean)
  const system = SYSTEMS.find(([, pattern]) => pattern.test(userAgent))?.[0]
  if (!browser && !system) return null

  return [browser, system].filter(Boolean).join(' · ')
}
