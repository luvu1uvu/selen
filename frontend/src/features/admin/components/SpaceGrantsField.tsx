import { useEffect, useRef } from 'react'
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
 * «Администратора» (withoutAdmin). emptyText — что сказать, пока строк нет (у гостя доступ обязателен).
 *
 * Фокус не теряется (правила вида, раздел 11): добавили строку — на её пространство; убрали — на × соседней строки,
 * иначе на «Добавить пространство»; сменили пространство (строка пересоздаётся) — снова на него.
 */
export function SpaceGrantsField({
  id,
  company,
  value,
  onChange,
  withoutAdmin = false,
  emptyText,
  error,
}: {
  id: string
  company: string
  value: SpaceGrantInput[]
  onChange: (value: SpaceGrantInput[]) => void
  withoutAdmin?: boolean
  emptyText?: string
  error?: string
}) {
  const { t } = useTranslation('admin')
  const spaces = useGrantableSpaces(company)
  const available = spaces.data ?? []
  const used = new Set(value.map((grant) => grant.space_id))
  const next = available.find((space) => !used.has(space.id))

  // Куда поставить фокус после изменения строк: data-focus элемента (`space:<id>`, `remove:<id>`, `add`)
  const root = useRef<HTMLFieldSetElement>(null)
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (pendingFocus.current === null) return
    root.current?.querySelector<HTMLElement>(`[data-focus="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  const spaceName = (spaceId: string) => {
    const space = available.find((item) => item.id === spaceId)
    return space ? `${space.name} (${space.key})` : ''
  }
  const update = (index: number, patch: Partial<SpaceGrantInput>) =>
    onChange(value.map((grant, i) => (i === index ? { ...grant, ...patch } : grant)))
  const remove = (index: number) => {
    const neighbour = value[index + 1] ?? value[index - 1]
    pendingFocus.current = neighbour ? `remove:${neighbour.space_id}` : 'add'
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <fieldset
      ref={root}
      className="grid gap-2"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">{t('spaceGrants.label')}</legend>
      {value.length === 0 && available.length > 0 && !error && (
        <p className="text-muted-foreground text-sm">{emptyText ?? t('spaceGrants.empty')}</p>
      )}
      {value.map((grant, index) => {
        const name = spaceName(grant.space_id)
        return (
          <div key={grant.space_id} className="flex flex-wrap items-center gap-2">
            <NativeSelect
              data-focus={`space:${grant.space_id}`}
              aria-label={t('spaceGrants.space')}
              value={grant.space_id}
              onChange={(event) => {
                pendingFocus.current = `space:${event.target.value}`
                update(index, { space_id: event.target.value })
              }}
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
              aria-label={t('spaceGrants.roleIn', { space: name })}
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
                aria-label={t('spaceGrants.ownCardsOnlyIn', { space: name })}
                onCheckedChange={(checked) => update(index, { own_cards_only: checked === true })}
              />
              {t('spaceGrants.ownCardsOnly')}
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  data-focus={`remove:${grant.space_id}`}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('spaceGrants.removeSpace', { space: name })}
                  onClick={() => remove(index)}
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('spaceGrants.removeSpace', { space: name })}</TooltipContent>
            </Tooltip>
          </div>
        )
      })}
      {next && (
        <Button
          data-focus="add"
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            pendingFocus.current = `space:${next.id}`
            onChange([
              ...value,
              {
                space_id: next.id,
                role: withoutAdmin ? 'commenter' : 'editor',
                own_cards_only: false,
              },
            ])
          }}
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
