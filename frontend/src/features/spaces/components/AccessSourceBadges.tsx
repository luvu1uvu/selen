import { useTranslation } from 'react-i18next'
import type { RoleKey, SpacePerson } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { sortRoles } from '../roles'

/**
 * Откуда у человека доступ (П2d-1): лично и/или через группы, на само пространство или через папку выше — с ролями
 * каждого источника.
 */
export function AccessSourceBadges({ person }: { person: SpacePerson }) {
  const { t } = useTranslation('spaces')
  const roles = (keys: RoleKey[]) =>
    sortRoles(keys)
      .map((role) => t(`roles.${role}`))
      .join(', ')

  return (
    <ul
      className="flex flex-wrap gap-1"
      aria-label={t('members.sourcesLabel', { name: person.user.name })}
    >
      {(person.sources ?? []).map((source) => (
        <li key={`${source.group?.id ?? 'personal'}|${source.folder?.id ?? ''}`}>
          {/* Длинный источник переносится, а не растягивает таблицу (UX-ревью П2d-1, M-9) */}
          <Badge
            variant={source.type === 'personal' && !source.folder ? 'secondary' : 'outline'}
            className="text-left whitespace-normal"
          >
            {source.type === 'personal'
              ? t('members.sources.personal', { roles: roles(source.roles) })
              : // Гостю группы компании-хозяина — без названий (решение PM 28.10)
                t('members.sources.group', {
                  group: source.group?.name ?? t('members.hiddenGroup'),
                  roles: roles(source.roles),
                })}
            {source.folder &&
              ` · ${t('members.sources.viaFolder', { folder: source.folder.name })}`}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
