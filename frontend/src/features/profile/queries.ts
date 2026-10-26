import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { currentUserKey } from '@/features/auth/queries'
import type { Theme, User } from '@/shared/types/api'
import { updateTheme } from './api'

/**
 * Выбор темы в меню пользователя (ADR-0025). Тема меняется сразу — запись в кэш пользователя (её показывает
 * installTheme), запрос — следом; несколько выборов подряд уходят по очереди (`scope`), последний и остаётся. Сервер не
 * сохранил — прежняя тема и уведомление.
 */
export function useUpdateTheme() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  return useMutation({
    scope: { id: 'theme' },
    mutationFn: (theme: Theme) => updateTheme(theme),
    onMutate: (theme) => {
      const previous = queryClient.getQueryData<User | null>(currentUserKey)
      if (previous) queryClient.setQueryData<User>(currentUserKey, { ...previous, theme })
      return { previous }
    },
    onError: (_error, _theme, context) => {
      const user = queryClient.getQueryData<User | null>(currentUserKey)
      // Пока шёл запрос, во вкладке мог смениться пользователь (409) — его тему не трогаем
      if (context?.previous && user?.id === context.previous.id) {
        queryClient.setQueryData<User>(currentUserKey, { ...user, theme: context.previous.theme })
      }
      toast.error(t('theme.saveFailed'))
    },
  })
}
