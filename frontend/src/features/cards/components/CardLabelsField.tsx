import { useTranslation } from 'react-i18next'
import { Tags } from 'lucide-react'
import { toast } from 'sonner'
import { useSpaceLabels } from '@/features/labels/queries'
import { getErrorMessage } from '@/shared/api/errors'
import { LabelBadge } from '@/shared/components/LabelBadge'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useSetCardLabels } from '../queries'

/**
 * Метки карточки («Основные параметры» окна): общие метки компании и метки пространства. Поставить можно только
 * активную метку; уже стоящая архивная остаётся, пока её не снимут.
 */
export function CardLabelsField({ card, canEdit }: { card: CardDetail; canEdit: boolean }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const labels = useSpaceLabels(card.space.key, canEdit)
  const setLabels = useSetCardLabels(card.key)
  const current = card.labels.map((label) => label.id)

  const toggle = async (id: string, checked: boolean) => {
    const next = checked ? [...current, id] : current.filter((labelId) => labelId !== id)
    try {
      await setLabels.mutateAsync(next)
      toast.success(t('card.saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  const available = (labels.data ?? []).filter(
    (label) => !label.archived_at || current.includes(label.id),
  )
  const groups = [
    { title: t('labels.company'), items: available.filter((label) => label.scope === 'company') },
    { title: t('labels.space'), items: available.filter((label) => label.scope === 'space') },
  ].filter((group) => group.items.length > 0)

  return (
    <>
      {card.labels.map((label) => (
        <LabelBadge key={label.id} name={label.name} color={label.color} />
      ))}
      {!canEdit && card.labels.length === 0 && (
        <span className="text-muted-foreground text-sm">{t('labels.none')}</span>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              // Значок вровень с левым краем значений «Основных параметров» (U-7 UX-ревью UI-1a)
              className="text-muted-foreground -ml-2 px-2 has-[>svg]:px-2"
              disabled={setLabels.isPending}
            >
              <Tags />
              {t('params.editLabels')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {labels.isPending && <DropdownMenuLabel>{tc('states.loading')}</DropdownMenuLabel>}
            {labels.isSuccess && groups.length === 0 && (
              <DropdownMenuLabel className="text-muted-foreground font-normal">
                {t('labels.empty')}
              </DropdownMenuLabel>
            )}
            {groups.map((group, index) => (
              <div key={group.title}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((label) => (
                  <DropdownMenuCheckboxItem
                    key={label.id}
                    checked={current.includes(label.id)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => toggle(label.id, checked)}
                  >
                    <LabelBadge name={label.name} color={label.color} />
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}
