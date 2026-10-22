import { useTranslation } from 'react-i18next'
import { NotFoundState } from '@/shared/components/NotFoundState'

/**
 * Ссылка на файл не открылась (/files/{id}, UI-1b): нет такого файла, нет доступа к карточке, карточка в корзине, файл
 * удалён — сервер отправляет сюда во всех случаях одинаково (решение PM 22.10), без имени файла и карточки.
 */
export function FileNotFoundPage() {
  const { t } = useTranslation()
  return <NotFoundState title={t('errors.fileNotFoundTitle')} text={t('errors.fileNotFoundText')} />
}
