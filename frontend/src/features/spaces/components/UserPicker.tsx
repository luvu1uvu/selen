import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { DirectoryUser } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { useDirectory } from '../queries'

/** Задержка перед поиском, чтобы не отправлять запрос на каждую букву. */
const SEARCH_DELAY_MS = 250

/**
 * Выбор сотрудника из справочника (без деактивированных): поле поиска и список найденных.
 * excludeIds — кого не предлагать (например, уже участников); onlyActive — без ещё не принявших приглашение.
 */
export function UserPicker({
  id,
  value,
  onChange,
  excludeIds = [],
  onlyActive = false,
  invalid = false,
}: {
  id: string
  value: DirectoryUser | null
  onChange: (user: DirectoryUser | null) => void
  excludeIds?: string[]
  onlyActive?: boolean
  invalid?: boolean
}) {
  const { t } = useTranslation('spaces')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  const directory = useDirectory(debounced, value === null)
  const options = (directory.data ?? []).filter(
    (user) => !excludeIds.includes(user.id) && (!onlyActive || user.status === 'active'),
  )

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <div className="min-w-0">
          <div className="truncate font-medium">{value.name}</div>
          <div className="text-muted-foreground truncate text-xs">{value.email}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('picker.clear')}
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Input
        id={id}
        placeholder={t('picker.search')}
        aria-invalid={invalid}
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul className="max-h-48 overflow-y-auto rounded-md border" aria-label={t('picker.search')}>
        {options.length === 0 && !directory.isPending && (
          <li className="text-muted-foreground px-3 py-2 text-sm">{t('picker.nothing')}</li>
        )}
        {options.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              className="hover:bg-accent w-full px-3 py-2 text-left text-sm"
              onClick={() => {
                setSearch('')
                onChange(user)
              }}
            >
              <span className="font-medium">{user.name}</span>{' '}
              <span className="text-muted-foreground text-xs">{user.email}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
