import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

/**
 * Ссылка на недоступное (ADR-0024; план «Прав 2.0», вопрос 9): нет доступа или нет такого — одно и то же, без
 * подробностей (и без упоминания компании): переход на главную и уведомление «Нет доступа к … или … не существует».
 * Адрес заменяется — «Назад» не вернёт на него; у уведомления постоянный id — повторный вызов его не дублирует.
 */
export function useLeaveInaccessible(missing: boolean, message: string) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!missing) return
    toast.error(message, { id: 'no-access' })
    navigate('/', { replace: true })
  }, [missing, message, navigate])
}
