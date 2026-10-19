import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LabelDialog } from '@/features/labels/components/LabelDialog'
import { LabelsTable } from '@/features/labels/components/LabelsTable'
import { useCompanyLabels } from '@/features/labels/queries'
import type { Label } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'

/** Общие метки компании (системный администратор): доступны на карточках всех пространств. */
export function LabelsPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const labelsQuery = useCompanyLabels()
  const [editing, setEditing] = useState<Label | 'new' | null>(null)

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('labels.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('labels.description')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('labels.create')}</Button>
      </div>

      {labelsQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}
      {labelsQuery.isSuccess && (
        <LabelsTable labels={labelsQuery.data} canManage onEdit={setEditing} />
      )}

      <LabelDialog spaceKey={null} label={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
