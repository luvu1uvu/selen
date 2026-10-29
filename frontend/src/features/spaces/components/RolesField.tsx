import { useTranslation } from 'react-i18next'
import type { RoleKey } from '@/shared/types/api'
import { Badge } from '@/shared/ui/badge'
import { ToggleChip } from '@/shared/ui/toggle-chip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
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
 * Выбор ролей чипами (П2d-1): каждая роль — переключатель (`ToggleChip`), можно выбрать несколько. Что даёт роль — в
 * подсказке на чипе (Tooltip, по наведению и фокусу; видна и до выбора). Под чипами — одна постоянная строка: при выборе
 * ничего не сдвигается (UX-ревью П2d-1, U-1). withoutManaging — без «Администратора» (гость, «Все сотрудники»).
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
  /** Под чипами — строка «можно несколько»; в строке выдачи — без неё (строка короче). */
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
        {options.map((role) => (
          <Tooltip key={role}>
            <TooltipTrigger asChild>
              <ToggleChip
                pressed={value.includes(role)}
                invalid={invalid}
                disabled={disabled}
                onClick={() => toggle(role)}
              >
                {t(`roles.${role}`)}
              </ToggleChip>
            </TooltipTrigger>
            <TooltipContent>{t(`roleHints.${role}`)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {showHints && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {t('rolesField.note')}
        </p>
      )}
    </div>
  )
}
