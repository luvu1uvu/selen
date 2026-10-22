import { useTranslation } from 'react-i18next'

/**
 * Пустое значение поля при просмотре — «—» для всех полей (решение PM 22.10). Где поле можно изменить, вместо пустого
 * значения — действие («Назначить», «Добавить участников», «Задать срок»).
 */
export function EmptyValue() {
  const { t } = useTranslation('boards')
  return <span className="text-muted-foreground">{t('params.empty')}</span>
}
