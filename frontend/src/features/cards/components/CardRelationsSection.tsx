import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail, CardRelation } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { relationApi, type RelationKind } from '../api'
import { useCardContentMutation } from '../queries'
import { CardPicker } from './CardPicker'
import { RelatedCardView } from './RelatedCardView'

/**
 * Родительские и дочерние карточки (в пределах пространства, несколько родителей), прогресс дочерних.
 * Связь со скрытой карточкой показывается, но убрать её может только тот, кто карточку видит.
 */
export function CardRelationsSection({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [adding, setAdding] = useState<RelationKind | null>(null)
  const add = useCardContentMutation((payload: { card: string; kind: RelationKind }) =>
    relationApi.add(card.key, payload),
  )
  const remove = useCardContentMutation((id: string) => relationApi.remove(card.key, id))
  const { parents, children, progress } = card.relations

  const pick = async (key: string) => {
    if (!adding) return
    try {
      await add.mutateAsync({ card: key, kind: adding })
      setAdding(null)
      toast.success(t('relations.added'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const list = (title: string, relations: CardRelation[]) =>
    relations.length > 0 && (
      <div className="grid gap-1">
        <span className="text-muted-foreground text-xs">{title}</span>
        <ul className="grid gap-1">
          {relations.map((relation) => (
            <li key={relation.id} className="flex min-w-0 items-center gap-2 text-sm">
              <RelatedCardView card={relation.card} />
              {canEdit && !relation.card.hidden && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto size-6 shrink-0"
                  aria-label={t('relations.remove', { key: relation.card.key })}
                  onClick={() =>
                    remove
                      .mutateAsync(relation.id)
                      .catch((error) => toast.error(getErrorMessage(error, tc('errors.generic'))))
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div className="grid gap-3">
      {parents.length === 0 && children.length === 0 && !canEdit && (
        <span className="text-muted-foreground text-sm">{t('relations.none')}</span>
      )}
      {list(t('relations.parents'), parents)}
      {progress && (
        <div className="grid gap-1">
          <span className="text-xs">{t('relations.progress', progress)}</span>
          <div
            role="progressbar"
            aria-label={t('relations.progress', progress)}
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            className="bg-muted h-1.5 overflow-hidden rounded"
          >
            <div
              className="h-full bg-emerald-600"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
      {list(t('relations.children'), children)}

      {canEdit &&
        (adding ? (
          <div className="grid gap-2">
            <CardPicker
              spaceKey={card.space.key}
              excludeKey={card.key}
              label={adding === 'parent' ? t('relations.pickParent') : t('relations.pickChild')}
              onPick={(picked) => pick(picked.key)}
            />
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setAdding(null)}
            >
              {tc('actions.cancel')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding('parent')}>
              <Plus />
              {t('relations.addParent')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding('child')}>
              <Plus />
              {t('relations.addChild')}
            </Button>
          </div>
        ))}
    </div>
  )
}
