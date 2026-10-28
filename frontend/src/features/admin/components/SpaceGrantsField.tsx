import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { RoleSelectOptions } from '@/features/spaces/components/RoleSelectOptions'
import type { SpaceGrantInput, SpaceRole } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { NativeSelect } from '@/shared/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useGrantableSpaces } from '../queries'

/**
 * Доступ к пространствам с ролью — в приглашении (по желанию) и у гостя (П2c, аудит Kaiten): строки «пространство —
 * роль — только свои карточки». В списке — пространства компании, где автор может выдавать доступ; гостю — роли без
 * «Администратора» (withoutAdmin).
 */
export function SpaceGrantsField({
  id,
  company,
  value,
  onChange,
  withoutAdmin = false,
  error,
}: {
  id: string
  company: string
  value: SpaceGrantInput[]
  onChange: (value: SpaceGrantInput[]) => void
  withoutAdmin?: boolean
  error?: string
}) {
  const { t } = useTranslation('admin')
  const spaces = useGrantableSpaces(company)
  const available = spaces.data ?? []
  const used = new Set(value.map((grant) => grant.space_id))
  const next = available.find((space) => !used.has(space.id))

  const update = (index: number, patch: Partial<SpaceGrantInput>) =>
    onChange(value.map((grant, i) => (i === index ? { ...grant, ...patch } : grant)))

  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">{t('spaceGrants.label')}</legend>
      {value.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('spaceGrants.empty')}</p>
      )}
      {value.map((grant, index) => (
        <div key={grant.space_id} className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={t('spaceGrants.space')}
            value={grant.space_id}
            onChange={(event) => update(index, { space_id: event.target.value })}
            className="min-w-40 flex-1"
          >
            {available
              .filter((space) => space.id === grant.space_id || !used.has(space.id))
              .map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} ({space.key})
                </option>
              ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('spaceGrants.role')}
            value={grant.role}
            onChange={(event) =>
              update(index, {
                role: event.target.value as SpaceRole,
                own_cards_only: event.target.value === 'admin' ? false : grant.own_cards_only,
              })
            }
            className="w-40"
          >
            <RoleSelectOptions withoutAdmin={withoutAdmin} />
          </NativeSelect>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={grant.own_cards_only ?? false}
              disabled={grant.role === 'admin'}
              onCheckedChange={(checked) => update(index, { own_cards_only: checked === true })}
            />
            {t('spaceGrants.ownCardsOnly')}
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('spaceGrants.remove')}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('spaceGrants.remove')}</TooltipContent>
          </Tooltip>
        </div>
      ))}
      {next && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() =>
            onChange([
              ...value,
              {
                space_id: next.id,
                role: withoutAdmin ? 'commenter' : 'editor',
                own_cards_only: false,
              },
            ])
          }
        >
          <Plus />
          {t('spaceGrants.add')}
        </Button>
      )}
      {!spaces.isPending && available.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('spaceGrants.none')}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </fieldset>
  )
}
