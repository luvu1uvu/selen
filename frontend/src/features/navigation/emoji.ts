/**
 * Иконка папки или пространства — ровно одна эмодзи (как правило App\Rules\Emoji на сервере):
 * одна графема, начинающаяся с эмодзи. Составные (👨‍👩‍👧, 👍🏽, флаги) — тоже одна графема.
 */
const EMOJI_START = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)/u

export function isSingleEmoji(value: string): boolean {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)]
  return segments.length === 1 && EMOJI_START.test(value)
}

/** Подборка для быстрого выбора; любую другую эмодзи можно вставить в поле. */
export const SUGGESTED_ICONS = [
  '📦',
  '💡',
  '📱',
  '💻',
  '🖥️',
  '🛠️',
  '⚙️',
  '🚀',
  '🎯',
  '📊',
  '📈',
  '📣',
  '🎨',
  '🧪',
  '🔒',
  '🧾',
  '💼',
  '🤝',
  '🏢',
  '👥',
  '📚',
  '🗂️',
  '📝',
  '🌐',
  '🤖',
  '👾',
  '🔥',
  '⭐',
  '❤️',
  '✅',
]
