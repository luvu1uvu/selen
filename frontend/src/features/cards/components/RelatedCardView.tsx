import { useTranslation } from 'react-i18next'
import { EyeOff, Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import type { RelatedCard } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { useCardLink } from '../useCardLink'

/**
 * Связанная или блокирующая карточка: номер-ссылка, название, категория. Невидимая зрителю —
 * «Скрытая карточка» без номера и названия (режим «только свои карточки»), в корзине — «Удалённая карточка».
 */
export function RelatedCardView({ card }: { card: RelatedCard }) {
  const { t } = useTranslation('boards')
  const cardLink = useCardLink()

  if (card.hidden) {
    const Icon = card.deleted ? Trash2 : EyeOff
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 italic">
        <Icon className="size-3.5" aria-hidden />
        {card.deleted ? t('relations.deleted') : t('relations.hidden')}
      </span>
    )
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Link
        {...cardLink(card.key)}
        className="inline-flex min-h-6 shrink-0 items-center font-mono text-xs hover:underline"
      >
        {card.key}
      </Link>
      <span className="truncate" title={card.title}>
        {card.title}
      </span>
      {card.archived ? (
        <Badge variant="outline" className="shrink-0">
          {t('relations.archived')}
        </Badge>
      ) : (
        card.category === 'done' && (
          <Badge variant="secondary" className="shrink-0">
            {t('categories.done')}
          </Badge>
        )
      )}
    </span>
  )
}
