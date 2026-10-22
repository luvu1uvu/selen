import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Цвета в компонентах — только смысловые токены index.css: цвет палитры Tailwind или hex не перекрасится темой
// (docs/ui-guidelines.md, раздел 2; LATER-91). Проверяются строки и шаблонные строки — className, cn(), cva(), style.
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe'
const COLOR_UTILITY =
  'bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide|decoration|accent|caret|placeholder'
const TOKENS_ONLY = 'только смысловые токены index.css (docs/ui-guidelines.md, раздел 2)'
const COLOR_CHECKS = [
  // bg-red-50, hover:text-emerald-700, dark:border-red-800, border-l-amber-500, text-white, bg-black/50
  [
    String.raw`\b(${COLOR_UTILITY})(-[a-z]+)?-((${PALETTE})-\d{2,3}|white|black)\b`,
    `Цвет палитры Tailwind в компоненте — ${TOKENS_ONLY}.`,
  ],
  // bg-[#fff], shadow-[0_1px_rgba(0,0,0,.1)], bg-[color-mix(...)]
  [
    String.raw`\[[^\]\s]*(#[0-9a-f]{3,8}\b|(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\()`,
    `Произвольный цвет в классе — ${TOKENS_ONLY}.`,
  ],
  // style={{ color: '#fff' }}, массивы цветов
  [
    String.raw`^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$`,
    `Цвет hex в компоненте — ${TOKENS_ONLY}; цвета данных (метки, типы, аватары) — в shared/lib/palette.ts.`,
  ],
  // ring-ring/50 приносит npx shadcn add: рамка фокуса с прозрачностью — меньше 3:1
  [
    String.raw`\b(ring|outline)-ring\/\d+`,
    'Рамка фокуса — без прозрачности: ring-ring, outline-ring (контраст 3:1, docs/ui-guidelines.md, раздел 11).',
  ],
]

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Все строки интерфейса — только через i18n (src/shared/i18n/locales).
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/test/**', 'src/shared/ui/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },
  // Цвета — только токены (COLOR_CHECKS выше). Исключения: палитры меток, типов и аватаров — цвета данных, одинаковые
  // в любой теме; тесты. Одиночное исключение — `// eslint-disable-next-line no-restricted-syntax -- причина`.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/shared/lib/palette.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...COLOR_CHECKS.flatMap(([pattern, message]) => [
          { selector: `Literal[value=/${pattern}/i]`, message },
          { selector: `TemplateElement[value.raw=/${pattern}/i]`, message },
        ]),
      ],
    },
  },
  // Компоненты shadcn/ui экспортируют вместе с компонентами вспомогательные функции
  {
    files: ['src/shared/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  prettier,
)
