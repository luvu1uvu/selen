import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/*
| Проверка цветов в make lint (LATER-91, docs/ui-guidelines.md, раздел 2): цвет палитры Tailwind, произвольный цвет
| и hex в компоненте, рамка фокуса с прозрачностью — ошибка; токены и оговорённые исключения — нет.
*/
const eslint = new ESLint()

async function colorErrors(code: string, filePath = 'src/features/demo/Demo.tsx'): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length
}

const component = (className: string) =>
  `export function Demo() {\n  return <div className="${className}" />\n}\n`

describe('проверка цветов в eslint.config.js', () => {
  it.each([
    'bg-red-50',
    'text-emerald-700',
    'hover:bg-amber-100',
    'dark:border-red-800',
    'border-l-blue-500',
    'ring-1 ring-red-300',
    'text-white',
    'bg-black/50',
    'bg-[#ff0000]',
    'bg-[color-mix(in_oklab,var(--color-muted)_40%,white)]',
    'shadow-[0_1px_2px_rgba(0,0,0,0.1)]',
    'focus-visible:ring-ring/50',
    'outline-ring/50',
  ])('ловит «%s» в className', async (className) => {
    expect(await colorErrors(component(className))).toBe(1)
  })

  it('ловит цвет в cn(), cva(), шаблонной строке и hex в style', async () => {
    expect(
      await colorErrors(`const a = cn('p-2', ok && 'text-red-700')\n`, 'src/shared/lib/demo.ts'),
    ).toBe(1)
    expect(
      await colorErrors(`const b = cva('', { variants: { v: { x: 'bg-emerald-100' } } })\n`),
    ).toBe(1)
    expect(await colorErrors('const c = `px-1 ${x} bg-slate-500`\n')).toBe(1)
    expect(await colorErrors(`const d = <span style={{ color: '#fff' }} />\n`)).toBe(1)
  })

  it('пропускает токены и не-цвета', async () => {
    const tokens = [
      'bg-danger-surface text-danger-foreground border-danger-border',
      'bg-success text-success-foreground ring-danger-outline/50',
      'bg-primary/10 text-muted-foreground bg-overlay from-edge-shade bg-board bg-lane',
      'focus-visible:ring-ring focus-visible:ring-[3px] outline-ring border-l-4',
      'text-xs bg-transparent text-current w-[calc(100%-1px)] p-[3px]',
    ]
    for (const className of tokens) expect(await colorErrors(component(className))).toBe(0)
    expect(await colorErrors(`const link = '#comments'\n`)).toBe(0)
  })

  it('исключения: палитры меток и аватаров, тесты, строка с причиной', async () => {
    expect(await colorErrors(`export const P = ['#3b82f6']\n`, 'src/shared/lib/palette.ts')).toBe(0)
    expect(await colorErrors(component('bg-red-50'), 'src/features/demo/Demo.test.tsx')).toBe(0)
    expect(await colorErrors(component('bg-red-50'), 'src/test/demo.tsx')).toBe(0)
    const disabled = `// eslint-disable-next-line no-restricted-syntax -- причина\nconst v = 'bg-black'\n`
    expect(await colorErrors(disabled)).toBe(0)
  })
})
