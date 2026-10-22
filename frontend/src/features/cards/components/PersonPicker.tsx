import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { useMembers } from '@/features/spaces/queries'
import { UserAvatar } from '@/shared/components/UserAvatar'
import { cn } from '@/shared/lib/utils'
import type { CardPerson, UserRef } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shared/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

/**
 * Человек в карточке: аватар, имя и пометки «приглашён», «деактивирован», «не в пространстве». `compact` — чип строки
 * «Основных параметров»: мелкий аватар (имя рядом — аватар диктору не читается).
 */
export function PersonLine({ person, compact = false }: { person: CardPerson; compact?: boolean }) {
  const { t } = useTranslation('boards')
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center', compact ? 'gap-1.5' : 'gap-2')}>
      {compact ? (
        <span aria-hidden>
          <UserAvatar id={person.id} name={person.name} size="xs" />
        </span>
      ) : (
        <UserAvatar id={person.id} name={person.name} />
      )}
      <span className="truncate">{person.name}</span>
      {person.status === 'invited' && <Badge variant="warning">{t('people.invited')}</Badge>}
      {person.status === 'deactivated' && (
        <Badge variant="destructive">{t('people.deactivated')}</Badge>
      )}
      {!person.in_space && <Badge variant="outline">{t('people.notInSpace')}</Badge>}
    </span>
  )
}

/** Поиск по имени без учёта регистра (по умолчанию cmdk ищет «нечётко» и по id). */
function byName(_value: string, search: string, keywords?: string[]) {
  return (keywords ?? []).join(' ').toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
}

/**
 * Выбор человека из участников пространства: всплывающий список с поиском по имени (shadcn Command). Назначать можно
 * участников пространства, кроме деактивированных; уже выбранные (`selected`) остаются в списке с галочкой, даже если
 * их больше нельзя назначить. `multiple` — список не закрывается после выбора (участники).
 */
export function PersonPicker({
  spaceKey,
  label,
  selected,
  current = [],
  multiple = false,
  disabled = false,
  extra,
  onSelect,
  children,
}: {
  spaceKey: string
  /** Подпись списка для экранного диктора и поля поиска. */
  label: string
  selected: string[]
  /** Уже назначенные — в списке, даже если не участники пространства или деактивированы. */
  current?: CardPerson[]
  multiple?: boolean
  disabled?: boolean
  /** Пункт под списком (например, «Снять ответственного»): получает функцию закрытия. */
  extra?: (close: () => void) => ReactNode
  onSelect: (user: UserRef) => void
  /** Кнопка, которая открывает список. */
  children: ReactNode
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [open, setOpen] = useState(false)
  const members = useMembers(spaceKey, open)

  const assignable = (members.data ?? [])
    .filter((member) => member.user.status !== 'deactivated')
    .map((member) => member.user as UserRef)
  const people = [
    ...current.filter((person) => !assignable.some((user) => user.id === person.id)),
    ...assignable,
  ]
  const close = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command filter={byName} label={label}>
          <CommandInput placeholder={t('params.searchPeople')} aria-label={label} />
          <CommandList label={label}>
            {members.isPending ? (
              <CommandGroup>
                <CommandItem disabled>{tc('states.loading')}</CommandItem>
              </CommandGroup>
            ) : (
              <CommandEmpty>{t('params.nobody')}</CommandEmpty>
            )}
            <CommandGroup>
              {people.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  // Пока изменение отправляется, второй выбор ждёт: иначе ответы перепишут друг друга
                  disabled={disabled}
                  keywords={[user.name]}
                  aria-label={
                    selected.includes(user.id)
                      ? t('params.selectedPerson', { name: user.name })
                      : undefined
                  }
                  onSelect={() => {
                    onSelect(user)
                    if (!multiple) close()
                  }}
                >
                  <span aria-hidden>
                    <UserAvatar id={user.id} name={user.name} size="xs" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{user.name}</span>
                  {selected.includes(user.id) && <Check aria-hidden />}
                </CommandItem>
              ))}
            </CommandGroup>
            {extra && (
              <>
                <CommandSeparator />
                <CommandGroup>{extra(close)}</CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
