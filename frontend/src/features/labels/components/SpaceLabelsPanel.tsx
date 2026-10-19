import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LabelBadge } from '@/shared/components/LabelBadge'
import type { Label, Space } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { useSpaceLabels } from '../queries'
import { LabelDialog } from './LabelDialog'
import { LabelsTable } from './LabelsTable'

/**
 * Метки на странице пространства: метками пространства управляет его администратор,
 * общие метки компании показываются для справки (их ведёт системный администратор).
 */
export function SpaceLabelsPanel({ space }: { space: Space }) {
  const { t } = useTranslation('spaces')
  const { t: tc } = useTranslation()
  const labelsQuery = useSpaceLabels(space.key)
  const [editing, setEditing] = useState<Label | 'new' | null>(null)
  const canManage = space.permissions.manage
  const labels = labelsQuery.data ?? []
  const company = labels.filter((label) => label.scope === 'company' && !label.archived_at)

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">{t('labels.spaceTitle')}</h2>
          {canManage && <Button onClick={() => setEditing('new')}>{t('labels.create')}</Button>}
        </div>
        {labelsQuery.isError && (
          <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
        )}
        {labelsQuery.isSuccess && (
          <LabelsTable
            labels={labels.filter((label) => label.scope === 'space')}
            canManage={canManage}
            onEdit={setEditing}
          />
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">{t('labels.companyTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('labels.companyHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          {company.map((label) => (
            <LabelBadge key={label.id} name={label.name} color={label.color} />
          ))}
          {labelsQuery.isSuccess && company.length === 0 && (
            <span className="text-muted-foreground text-sm">{t('labels.empty')}</span>
          )}
        </div>
      </section>

      <LabelDialog spaceKey={space.key} label={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
