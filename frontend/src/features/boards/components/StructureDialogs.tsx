import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/api/errors'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import type { BoardColumn, ColumnCategory, Lane } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import {
  archiveColumn,
  archiveLane,
  changeColumnCategory,
  createColumn,
  createLane,
  renameColumn,
  renameLane,
  updateBoard,
} from '../api'
import { useStructureMutation } from '../queries'
import { CategorySelect } from './CategorySelect'
import { DescriptionDialog } from './DescriptionDialog'
import { NameDialog } from './NameDialog'

/** Какое действие со структурой доски сейчас открыто. */
export type StructureAction =
  | { kind: 'addColumn' }
  | { kind: 'addSubcolumn'; parent: BoardColumn }
  | { kind: 'renameColumn'; column: BoardColumn }
  | { kind: 'changeType'; column: BoardColumn; cardsCount: number }
  | { kind: 'archiveColumn'; column: BoardColumn }
  | { kind: 'addLane' }
  | { kind: 'renameLane'; lane: Lane }
  | { kind: 'archiveLane'; lane: Lane }
  | { kind: 'renameBoard'; name: string }
  | { kind: 'boardDescription'; description: string | null }
  | null

function useNotify() {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  return async (action: () => Promise<unknown>, success = t('column.saved')) => {
    try {
      await action()
      toast.success(success)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
      return false
    }
  }
}

/** Все диалоги изменения структуры доски — открываются из меню колонок, дорожек и доски. */
export function StructureDialogs({
  boardId,
  action,
  onClose,
}: {
  boardId: string
  action: StructureAction
  onClose: () => void
}) {
  const { t } = useTranslation('boards')
  const notify = useNotify()
  const [category, setCategory] = useState<ColumnCategory>('in_progress')
  const mutation = useStructureMutation((fn: () => Promise<unknown>) => fn())
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    if (await notify(() => mutation.mutateAsync(fn), success)) onClose()
  }

  return (
    <>
      <NameDialog
        open={action?.kind === 'addColumn'}
        title={t('column.newTitle')}
        submitLabel={t('board.addColumn')}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) => run(() => createColumn(boardId, { name, category }))}
      >
        <FormField id="new-column-type" label={t('column.type')}>
          <CategorySelect id="new-column-type" value={category} onChange={setCategory} />
        </FormField>
      </NameDialog>

      <NameDialog
        open={action?.kind === 'addSubcolumn'}
        title={
          action?.kind === 'addSubcolumn'
            ? t('column.newSubTitle', { name: action.parent.name })
            : ''
        }
        description={t('column.subHint')}
        submitLabel={t('column.addSubcolumn')}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) =>
          action?.kind === 'addSubcolumn' &&
          run(() => createColumn(boardId, { name, parent_id: action.parent.id }))
        }
      />

      <NameDialog
        open={action?.kind === 'renameColumn'}
        title={t('rename.title')}
        initialName={action?.kind === 'renameColumn' ? action.column.name : ''}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) =>
          action?.kind === 'renameColumn' && run(() => renameColumn(action.column.id, name))
        }
      />

      <NameDialog
        open={action?.kind === 'addLane'}
        title={t('lane.newTitle')}
        submitLabel={t('board.addLane')}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) => run(() => createLane(boardId, { name }))}
      />

      <NameDialog
        open={action?.kind === 'renameLane'}
        title={t('lane.renameTitle')}
        initialName={action?.kind === 'renameLane' ? action.lane.name : ''}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) =>
          action?.kind === 'renameLane' && run(() => renameLane(action.lane.id, name))
        }
      />

      <NameDialog
        open={action?.kind === 'renameBoard'}
        title={t('board.rename')}
        initialName={action?.kind === 'renameBoard' ? action.name : ''}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(name) => run(() => updateBoard(boardId, { name }))}
      />

      <DescriptionDialog
        open={action?.kind === 'boardDescription'}
        initialDescription={action?.kind === 'boardDescription' ? action.description : null}
        pending={mutation.isPending}
        onClose={onClose}
        onSubmit={(description) =>
          run(
            () => updateBoard(boardId, { description }),
            description ? t('board.descriptionSaved') : t('board.descriptionRemoved'),
          )
        }
      />

      {action?.kind === 'changeType' && (
        <ChangeTypeDialog
          column={action.column}
          cardsCount={action.cardsCount}
          pending={mutation.isPending}
          onClose={onClose}
          onSubmit={(next) =>
            run(() => changeColumnCategory(action.column.id, next), t('column.typeChanged'))
          }
        />
      )}

      <ConfirmDialog
        open={action?.kind === 'archiveColumn' || action?.kind === 'archiveLane'}
        onOpenChange={(open) => !open && onClose()}
        pending={mutation.isPending}
        title={
          action?.kind === 'archiveColumn'
            ? `${t('column.archive')}: ${action.column.name}`
            : action?.kind === 'archiveLane'
              ? `${t('lane.archive')}: ${action.lane.name}`
              : ''
        }
        description=""
        confirmLabel={t('column.archive')}
        onConfirm={() => {
          if (action?.kind === 'archiveColumn') {
            void run(() => archiveColumn(action.column.id), t('column.archived'))
          } else if (action?.kind === 'archiveLane') {
            void run(() => archiveLane(action.lane.id), t('lane.archived'))
          }
        }}
      />
    </>
  )
}

/** Смена типа колонки с предупреждением, сколько карточек сменят статус. */
function ChangeTypeDialog({
  column,
  cardsCount,
  pending,
  onClose,
  onSubmit,
}: {
  column: BoardColumn
  cardsCount: number
  pending: boolean
  onClose: () => void
  onSubmit: (category: ColumnCategory) => void
}) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const [category, setCategory] = useState<ColumnCategory>(column.category)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('column.typeTitle', { name: column.name })}</DialogTitle>
        </DialogHeader>
        <FormField id="column-type" label={t('column.type')}>
          <CategorySelect id="column-type" value={category} onChange={setCategory} />
        </FormField>
        {category !== column.category && (
          <Alert>
            {cardsCount > 0
              ? t('column.typeWarning', { count: cardsCount })
              : t('column.typeNoCards')}
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button
            disabled={pending || category === column.category}
            onClick={() => onSubmit(category)}
          >
            {tc('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
