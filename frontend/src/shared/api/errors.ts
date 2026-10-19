import { isAxiosError } from 'axios'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

export interface ApiErrorBody {
  message?: string
  code?: string
  errors?: Record<string, string[]>
}

export function getErrorBody(error: unknown): ApiErrorBody | undefined {
  return isAxiosError<ApiErrorBody>(error) ? error.response?.data : undefined
}

export function getErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined
}

/**
 * Разложить ошибки валидации Laravel (422) по полям формы react-hook-form.
 * Возвращает true, если ошибки валидации были.
 */
export function applyValidationErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): boolean {
  const body = getErrorBody(error)
  if (getErrorStatus(error) !== 422 || !body?.errors) return false

  for (const [field, messages] of Object.entries(body.errors)) {
    setError(field as Path<T>, { type: 'server', message: messages[0] })
  }
  return true
}

/** Сообщение об ошибке для показа пользователю: текст с сервера или общий ключ i18n. */
export function getErrorMessage(error: unknown, fallback: string): string {
  const status = getErrorStatus(error)
  const body = getErrorBody(error)
  if (status && status < 500 && body?.message) return body.message
  return fallback
}
