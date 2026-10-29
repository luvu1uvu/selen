import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { RoleKey } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { cn } from '@/shared/lib/utils'
import { MANAGING_ROLES, ROLE_KEYS, sortRoles } from '../roles'

/**
 * Роли чипами — только показ (П2d-1): у субъекта на папке или пространстве может быть несколько ролей.
 */
export function RoleChips({ roles, className }: { roles: RoleKey[]; className?: string }) {
  const { t } = useTranslation('spaces')
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {sortRoles(roles).map((role) => (
        <Badge key={role} variant="secondary">
          {t(`roles.${role}`)}
        </Badge>
      ))}
    </span>
  )
}

/**
 * Выбор ролей чипами (П2d-1): каждая роль — переключатель (`aria-pressed`), выбранные — с галочкой; можно выбрать
 * несколько. Под чипами — что дают выбранные роли. withoutManaging — без «Администратора» (гость, «Все сотрудники»).
 */
export function RolesField({
  id,
  label,
  value,
  onChange,
  withoutManaging = false,
  disabled = false,
  invalid = false,
  showHints = true,
}: {
  id: string
  /** Имя группы чипов для экранного диктора; по умолчанию — «Роли». */
  label?: string
  value: RoleKey[]
  onChange: (roles: RoleKey[]) => void
  withoutManaging?: boolean
  disabled?: boolean
  invalid?: boolean
  /** Под чипами — что дают выбранные роли; в строке выдачи — без них (строка короче). */
  showHints?: boolean
}) {
  const { t } = useTranslation('spaces')
  const options = withoutManaging
    ? ROLE_KEYS.filter((role) => !MANAGING_ROLES.includes(role))
    : ROLE_KEYS
  const toggle = (role: RoleKey) =>
    onChange(
      value.includes(role) ? value.filter((item) => item !== role) : sortRoles([...value, role]),
    )
  const selected = sortRoles(value)

  return (
    <div className="grid gap-2">
      <div
        id={id}
        role="group"
        // Подпись FormField (<label for>) группе не достаётся — имя группы задаём сами; ошибка FormField — `${id}-error`
        aria-label={label ?? t('rolesField.label')}
        aria-invalid={invalid || undefined}
        aria-describedby={
          [showHints && `${id}-hint`, invalid && `${id}-error`].filter(Boolean).join(' ') ||
          undefined
        }
        className="flex flex-wrap gap-2"
      >
        {options.map((role) => {
          const on = value.includes(role)
          return (
            <button
              key={role}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => toggle(role)}
              className={cn(
                'focus-visible:ring-ring inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                on
                  ? 'border-primary bg-selected text-foreground font-medium'
                  : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {on && <Check className="size-3.5" aria-hidden />}
              {t(`roles.${role}`)}
            </button>
          )
        })}
      </div>
      {showHints && (
        <ul id={`${id}-hint`} className="text-muted-foreground grid gap-0.5 text-xs">
          {selected.length === 0 ? (
            <li>{t('rolesField.empty')}</li>
          ) : (
            selected.map((role) => (
              <li key={role}>
                {t('rolesField.hint', { role: t(`roles.${role}`), hint: t(`roleHints.${role}`) })}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
