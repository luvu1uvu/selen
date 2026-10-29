import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { AccessSubject, AdminNavNode } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { NativeSelect } from '@/shared/ui/select'
import { useMoveImpact, useMoveNavNode } from '../queries'
import { descendantIds, folderHeight } from '../tree'

const ROOT = ''

/**
 * «Переместить в…»: корень или активная папка. Папку нельзя переместить в саму себя, во вложенную
 * и туда, где поддерево станет глубже предела (те же проверки — на сервере). Узел встаёт в конец папки.
 * До подтверждения — что изменится в доступе (П2d-1: доступ к папке действует на всё внутри): «Получат доступ»,
 * «Потеряют доступ», «Изменятся роли» и выдачи, которые сейчас не действуют; если пространство останется без того, кто
 * лично управляет доступом, — объяснение, кнопка недоступна (сервер тоже отказывает). Перемещение, которое меняет доступ
 * (хоть что-то из перечисленного), — только с правом «Управлять доступом» (решения PM 29.10): без него — объяснение,
 * кнопка недоступна.
 */
export function MoveNodeDialog({
  node,
  ...props
}: {
  node: AdminNavNode | null
  /** Активная часть дерева (без архивного). */
  nodes: AdminNavNode[]
  maxDepth: number
  /** Право компании «Управлять доступом»: без него нельзя перемещение, после которого кто-то получит или потеряет доступ. */
  canManageAccess: boolean
  onClose: () => void
}) {
  // Новый узел — новая форма с его текущей папкой по умолчанию
  return node ? <MoveNodeForm key={node.id} node={node} {...props} /> : null
}

function MoveNodeForm({
  node,
  nodes,
  maxDepth,
  canManageAccess,
  onClose,
}: {
  node: AdminNavNode
  nodes: AdminNavNode[]
  maxDepth: number
  canManageAccess: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const move = useMoveNavNode()
  const [target, setTarget] = useState(node.parent_id ?? ROOT)
  const parentId = target === ROOT ? null : target
  const changed = target !== (node.parent_id ?? ROOT)
  const impact = useMoveImpact(node.id, parentId, changed)
  const unmanaged = impact.data?.unmanaged_spaces ?? []
  const needsAccessRight = !!impact.data?.changes_access && !canManageAccess

  const name = node.name ?? node.space?.name ?? ''
  const excluded = node.type === 'folder' ? descendantIds(nodes, node.id) : new Set<string>()
  const height = node.type === 'folder' ? folderHeight(nodes, node.id) : 0
  const folders = nodes.filter((item) => item.type === 'folder')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await move.mutateAsync({ id: node.id, parent_id: parentId })
      toast.success(t('structure.toasts.moved'))
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('structure.move.title', { name })}</DialogTitle>
          <DialogDescription>{t('structure.move.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <FormField id="move-target" label={t('structure.move.target')}>
            <NativeSelect
              id="move-target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              <option value={ROOT}>{t('structure.root')}</option>
              {folders.map((folder) => {
                const tooDeep = folder.depth + height > maxDepth
                return (
                  <option
                    key={folder.id}
                    value={folder.id}
                    disabled={excluded.has(folder.id) || tooDeep}
                    title={tooDeep ? t('structure.move.tooDeep', { max: maxDepth }) : undefined}
                  >
                    {`${'  '.repeat(folder.depth - 1)}${folder.icon ? `${folder.icon} ` : ''}${folder.name}`}
                  </option>
                )
              })}
            </NativeSelect>
          </FormField>
          {changed && <AccessImpact impact={impact} needsAccessRight={needsAccessRight} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                move.isPending ||
                !changed ||
                !impact.isSuccess ||
                unmanaged.length > 0 ||
                needsAccessRight
              }
            >
              {t('structure.move.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Что изменится в доступе при перемещении: кто получит, кто потеряет, у кого изменятся роли, выдачи, которые сейчас не
 * действуют; почему переместить нельзя — сверху, все причины в одном месте.
 */
function AccessImpact({
  impact,
  needsAccessRight,
}: {
  impact: ReturnType<typeof useMoveImpact>
  needsAccessRight: boolean
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  if (impact.isPending) {
    return <p className="text-muted-foreground text-sm">{t('structure.move.impactLoading')}</p>
  }
  if (impact.isError) {
    return (
      <p className="text-destructive text-sm">
        {getErrorMessage(impact.error, tc('errors.generic'))}
      </p>
    )
  }
  const { gain, lose, changed, dormant, unmanaged_spaces: unmanaged } = impact.data
  const names = (subjects: AccessSubject[]) =>
    subjects
      .map((subject) =>
        subject.type === 'group'
          ? t('structure.move.groupSubject', { name: subject.name })
          : subject.name,
      )
      .join(', ')

  return (
    <div className="grid gap-2 text-sm" aria-live="polite">
      {unmanaged.length > 0 && (
        <Alert variant="destructive">
          {t(unmanaged.length === 1 ? 'structure.move.unmanagedOne' : 'structure.move.unmanaged', {
            spaces: unmanaged.map((space) => `«${space.name}»`).join(', '),
          })}
        </Alert>
      )}
      {needsAccessRight && <Alert variant="destructive">{t('structure.move.needsAccess')}</Alert>}
      {!impact.data.changes_access ? (
        <p className="text-muted-foreground">{t('structure.move.impactNone')}</p>
      ) : (
        <>
          {gain.length > 0 && (
            <p>
              <span className="font-medium">{t('structure.move.gain')}:</span> {names(gain)}
            </p>
          )}
          {lose.length > 0 && (
            <p>
              <span className="font-medium">{t('structure.move.lose')}:</span> {names(lose)}
            </p>
          )}
          {changed.length > 0 && (
            <p>
              <span className="font-medium">{t('structure.move.changed')}:</span> {names(changed)}
            </p>
          )}
          {dormant && <p className="text-muted-foreground">{t('structure.move.dormant')}</p>}
        </>
      )}
    </div>
  )
}
