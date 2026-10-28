import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { DirectoryUser } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useDirectory } from '../queries'

/** Задержка перед поиском, чтобы не отправлять запрос на каждую букву. */
const SEARCH_DELAY_MS = 250

/**
 * Выбор сотрудника компании из справочника (без деактивированных): поле поиска и список найденных.
 * companyId — чьих людей предлагать (ADR-0024); excludeIds — кого не предлагать (например, уже участников);
 * onlyActive — без ещё не принявших приглашение; homes — только «дома» компании (состав группы, администраторы
 * компании), без Владельца, если он не её сотрудник.
 * Фокус не теряется (правила вида, раздел 11): выбрали человека — на «Изменить выбор», очистили — в поле поиска.
 */
export function UserPicker({
  id,
  companyId,
  value,
  onChange,
  excludeIds = [],
  onlyActive = false,
  homes = false,
  invalid = false,
}: {
  id: string
  companyId: string
  value: DirectoryUser | null
  onChange: (user: DirectoryUser | null) => void
  excludeIds?: string[]
  onlyActive?: boolean
  homes?: boolean
  invalid?: boolean
}) {
  const { t } = useTranslation('spaces')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const clearButton = useRef<HTMLButtonElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const pendingFocus = useRef<'clear' | 'search' | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (pendingFocus.current === null) return
    ;(pendingFocus.current === 'clear' ? clearButton : searchInput).current?.focus()
    pendingFocus.current = null
  })

  const directory = useDirectory(companyId, debounced, value === null, homes)
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={clearButton}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('picker.clear')}
              onClick={() => {
                pendingFocus.current = 'search'
                onChange(null)
              }}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('picker.clear')}</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      <Input
        ref={searchInput}
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
              className="hover:bg-accent w-full px-3 py-2 text-left text-sm focus-visible:-outline-offset-2"
              onClick={() => {
                setSearch('')
                pendingFocus.current = 'clear'
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
