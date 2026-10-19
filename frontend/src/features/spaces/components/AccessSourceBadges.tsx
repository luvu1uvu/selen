import { useTranslation } from 'react-i18next'
import type { SpacePerson } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'

/** Откуда у человека доступ: лично и/или через группы — с ролью и режимом «только свои карточки». */
export function AccessSourceBadges({ person }: { person: SpacePerson }) {
  const { t } = useTranslation('spaces')
  const personal = person.personal ?? null

  return (
    <ul
      className="flex flex-wrap gap-1"
      aria-label={t('members.sourcesLabel', { name: person.user.name })}
    >
      {personal && (
        <li>
          <Badge variant="secondary">
            {t('members.sources.personal', { role: t(`roles.${personal.role}`) })}
            {personal.own_cards_only && ` · ${t('members.ownCardsOnly')}`}
          </Badge>
        </li>
      )}
      {(person.groups ?? []).map((group) => (
        <li key={group.id}>
          <Badge variant="outline">
            {t('members.sources.group', { group: group.name, role: t(`roles.${group.role}`) })}
            {group.own_cards_only && ` · ${t('members.ownCardsOnly')}`}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
