import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDebouncedValue } from '@/shared/lib/useDebouncedValue'
import type { CardSummary } from '@/shared/types/api'
import { Input } from '@/shared/ui/input'
import { useCardSearch } from '../queries'

/**
 * Выбор карточки пространства по номеру или названию. Сервер отдаёт только видимые пользователю
 * карточки (режим «только свои карточки»), текущая карточка из списка исключается.
 */
export function CardPicker({
  spaceKey,
  excludeKey,
  label,
  onPick,
}: {
  spaceKey: string
  excludeKey: string
  label: string
  onPick: (card: CardSummary) => void
}) {
  const { t } = useTranslation('boards')
  const [query, setQuery] = useState('')
  const search = useDebouncedValue(query.trim())
  const results = useCardSearch(spaceKey, search)
  const cards = (results.data ?? []).filter((card) => card.key !== excludeKey)

  return (
    <div className="grid gap-1">
      <Input
        value={query}
        autoFocus
        aria-label={label}
        placeholder={t('picker.placeholder')}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="max-h-48 overflow-y-auto rounded-md border" aria-label={t('picker.results')}>
        {results.isSuccess && cards.length === 0 && (
          <li className="text-muted-foreground px-2 py-1.5 text-sm">{t('picker.nothing')}</li>
        )}
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="hover:bg-muted flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm"
              onClick={() => onPick(card)}
            >
              <span className="font-mono text-xs">{card.key}</span>
              <span className="min-w-0 flex-1 truncate">{card.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{card.column.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
