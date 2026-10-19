import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import type { AdminNavNode } from '@/shared/types/api'
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
import { useMoveNavNode } from '../queries'
import { descendantIds, folderHeight } from '../tree'

const ROOT = ''

/**
 * «Переместить в…»: корень или активная папка. Папку нельзя переместить в саму себя, во вложенную
 * и туда, где поддерево станет глубже предела (те же проверки — на сервере). Узел встаёт в конец папки.
 */
export function MoveNodeDialog({
  node,
  ...props
}: {
  node: AdminNavNode | null
  /** Активная часть дерева (без архивного). */
  nodes: AdminNavNode[]
  maxDepth: number
  onClose: () => void
}) {
  // Новый узел — новая форма с его текущей папкой по умолчанию
  return node ? <MoveNodeForm key={node.id} node={node} {...props} /> : null
}

function MoveNodeForm({
  node,
  nodes,
  maxDepth,
  onClose,
}: {
  node: AdminNavNode
  nodes: AdminNavNode[]
  maxDepth: number
  onClose: () => void
}) {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const move = useMoveNavNode()
  const [target, setTarget] = useState(node.parent_id ?? ROOT)

  const name = node.name ?? node.space?.name ?? ''
  const excluded = node.type === 'folder' ? descendantIds(nodes, node.id) : new Set<string>()
  const height = node.type === 'folder' ? folderHeight(nodes, node.id) : 0
  const folders = nodes.filter((item) => item.type === 'folder')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await move.mutateAsync({ id: node.id, parent_id: target === ROOT ? null : target })
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" disabled={move.isPending || target === (node.parent_id ?? ROOT)}>
              {t('structure.move.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
