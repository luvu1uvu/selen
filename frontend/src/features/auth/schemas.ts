import type { TFunction } from 'i18next'
import { z } from 'zod'

/** Минимальная длина пароля. Должна совпадать с Password::defaults() на backend. */
export const PASSWORD_MIN_LENGTH = 10

export function emailSchema(t: TFunction<'auth'>) {
  return z
    .string()
    .trim()
    .min(1, t('validation.emailRequired'))
    .pipe(z.email(t('validation.emailInvalid')))
}

export function newPasswordSchema(t: TFunction<'auth'>) {
  return z
    .object({
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t('validation.passwordMin', { min: PASSWORD_MIN_LENGTH })),
      password_confirmation: z.string(),
    })
    .refine((v) => v.password === v.password_confirmation, {
      message: t('validation.passwordsMismatch'),
      path: ['password_confirmation'],
    })
}
