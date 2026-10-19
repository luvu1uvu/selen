import * as React from 'react'
import { Label } from './label'

/**
 * Поле формы: подпись, контрол и текст ошибки.
 * id контрола передаётся явно, чтобы подпись была связана с полем (доступность и тесты).
 */
function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: React.ReactNode
  error?: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-muted-foreground text-xs">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

export { FormField }
