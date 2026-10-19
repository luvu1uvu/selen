import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import type { Paginated } from '@/shared/types/api'

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: Paginated<unknown>['meta']
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  if (meta.last_page <= 1) return null

  return (
    <div className="text-muted-foreground flex items-center justify-between gap-2 pt-4 text-sm">
      <span>
        {t('pagination.summary', {
          page: meta.current_page,
          pages: meta.last_page,
          total: meta.total,
        })}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.current_page <= 1}
          onClick={() => onPageChange(meta.current_page - 1)}
        >
          {t('pagination.prev')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.current_page >= meta.last_page}
          onClick={() => onPageChange(meta.current_page + 1)}
        >
          {t('pagination.next')}
        </Button>
      </div>
    </div>
  )
}
