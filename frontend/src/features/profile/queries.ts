import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { currentUserKey } from '@/features/auth/queries'
import { getErrorBody, getErrorStatus } from '@/shared/api/errors'
import type { Theme, User } from '@/shared/types/api'
import { updateTheme } from './api'

const themeMutationKey = ['profile', 'theme'] as const

/**
 * Выбор темы в меню пользователя (ADR-0025). Тема меняется сразу — запись в кэш пользователя (её показывает
 * installTheme), запрос — следом; несколько выборов подряд уходят по очереди (`scope`), последний и остаётся: после
 * него тема сверяется с сервером (`/auth/me`). Сервер не сохранил последний выбор — прежняя тема и уведомление.
 */
export function useUpdateTheme() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  // Этот выбор — последний в очереди (идущий считается сам)
  const isLast = () => queryClient.isMutating({ mutationKey: themeMutationKey }) === 1
  return useMutation({
    mutationKey: themeMutationKey,
    scope: { id: 'theme' },
    mutationFn: (theme: Theme) => updateTheme(theme),
    onMutate: async (theme) => {
      // Идущий запрос /auth/me (меню открылось — данные устарели) вернул бы прежнюю тему поверх выбора
      await queryClient.cancelQueries({ queryKey: currentUserKey })
      const previous = queryClient.getQueryData<User | null>(currentUserKey)
      if (previous) queryClient.setQueryData<User>(currentUserKey, { ...previous, theme })
      return { previous }
    },
    onError: (error, _theme, context) => {
      // Сменился пользователь вкладки (409) — тему и данные приносит installSession, уведомление не о том
      const code = getErrorBody(error)?.code
      if (
        getErrorStatus(error) === 409 &&
        (code === 'session_changed' || code === 'session_unverified')
      )
        return
      const user = queryClient.getQueryData<User | null>(currentUserKey)
      // Следом уже выбрана другая тема — откатывать нечего, её покажет и сверит последний выбор
      if (isLast() && context?.previous && user?.id === context.previous.id) {
        queryClient.setQueryData<User>(currentUserKey, { ...user, theme: context.previous.theme })
      }
      toast.error(t('theme.saveFailed'))
    },
    onSettled: () => {
      if (isLast()) void queryClient.invalidateQueries({ queryKey: currentUserKey })
    },
  })
}
