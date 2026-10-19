import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { buildLayout } from '@/features/boards/model'
import { useBoard, useSpaceBoards } from '@/features/boards/queries'
import { getErrorMessage } from '@/shared/api/errors'
import type { CardDetail } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { FormField } from '@/shared/ui/form-field'
import { NativeSelect } from '@/shared/ui/select'
import { useMoveCardToPlace } from '../queries'

/** Перемещение карточки в любую ячейку любой доски того же пространства. */
export function MoveCardDialog({ card, onClose }: { card: CardDetail; onClose: () => void }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const boards = useSpaceBoards(card.space.key)
  const [boardId, setBoardId] = useState(card.board.id)
  const board = useBoard(boardId)
  const leaves = useMemo(
    () => (board.data ? buildLayout(board.data.columns).leaves : []),
    [board.data],
  )
  const [selectedColumnId, setColumnId] = useState(card.column.id)
  const [selectedLaneId, setLaneId] = useState(card.lane.id)
  const move = useMoveCardToPlace(card.key)

  // Если выбранной колонки/дорожки нет на выбранной доске — берём первую
  const lanes = board.data?.lanes ?? []
  const columnId = leaves.some((c) => c.id === selectedColumnId)
    ? selectedColumnId
    : (leaves[0]?.id ?? '')
  const laneId = lanes.some((l) => l.id === selectedLaneId) ? selectedLaneId : (lanes[0]?.id ?? '')

  const parentName = (parentId: string | null) =>
    board.data?.columns.find((c) => c.id === parentId)?.name

  const submit = async () => {
    try {
      await move.mutateAsync({ board_id: boardId, column_id: columnId, lane_id: laneId })
      toast.success(t('moveCard.moved'))
      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, tc('errors.generic')))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('moveCard.title', { key: card.key })}</DialogTitle>
        </DialogHeader>
        <FormField id="move-board" label={t('moveCard.board')}>
          <NativeSelect
            id="move-board"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            {(boards.data ?? [])
              .filter((b) => !b.archived_at)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <FormField id="move-column" label={t('moveCard.column')}>
          <NativeSelect
            id="move-column"
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
          >
            {leaves.map((column) => (
              <option key={column.id} value={column.id}>
                {column.parent_id
                  ? `${parentName(column.parent_id)} / ${column.name}`
                  : column.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="move-lane" label={t('moveCard.lane')}>
          <NativeSelect id="move-lane" value={laneId} onChange={(e) => setLaneId(e.target.value)}>
            {lanes.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button disabled={move.isPending || !columnId || !laneId} onClick={submit}>
            {t('moveCard.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
