import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeBoardCard, makeBoardDetail } from '@/test/boards'
import { CardTileView } from './components/CardTile'
import { buildLookups } from './model'

/*
| Фасад карточки на токенах (LATER-91): срочная — обводка danger-outline/50, заблокированная — сплошная danger-outline.
| У срочной и заблокированной сразу — сплошная: cn (tailwind-merge) оставляет последний класс цвета обводки, а не тот,
| что идёт позже в CSS (U-5 UX-ревью LATER-91 — не подтвердилась).
*/
const lookups = buildLookups(makeBoardDetail(), 'UTC')

function tile(overrides: Parameters<typeof makeBoardCard>[0]) {
  render(<CardTileView card={makeBoardCard(overrides)} lookups={lookups} />)
  return screen.getByText(`DEV-${overrides.id}`).closest('.rounded-md')!
}

describe('CardTileView: срочная и заблокированная', () => {
  it('срочная — полупрозрачная обводка', () => {
    expect(tile({ id: 'u', column_id: 'todo', is_urgent: true })).toHaveClass(
      'ring-danger-outline/50',
    )
  })

  it('срочная и заблокированная — сплошная обводка блокировки', () => {
    const element = tile({ id: 'ub', column_id: 'todo', is_urgent: true, is_blocked: true })
    expect(element).toHaveClass('ring-danger-outline', 'border-danger-outline', 'bg-danger-surface')
    expect(element).not.toHaveClass('ring-danger-outline/50')
  })
})
