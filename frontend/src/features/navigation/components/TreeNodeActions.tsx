import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Smile,
  SquareKanban,
  SquarePlus,
  Trash2,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { hideHintUnlessKeyboard } from '@/shared/ui/restore-focus'
import type { NavTreeNode } from '@/shared/types/api'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import type { StructureActions } from '../useStructureActions'

const buttonClass =
  'text-muted-foreground hover:bg-background hover:text-foreground flex size-6 items-center justify-center rounded'

/**
 * Подсказка кнопки-значка — Tooltip (CLAUDE.md, фронтенд, правило 8; LATER-88), по фокусу — только с клавиатуры: меню,
 * закрытое мышью, возвращает фокус на кнопку, и подсказка висела бы (как у `ActionsMenu`).
 */
function TriggerHint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild onFocus={hideHintUnlessKeyboard}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Кнопки «+» и «⋯» строки дерева (docs/ui-reference/kaiten/README.md, «01 — Дерево»): видны при наведении
 * и при фокусе с клавиатуры. Только пункты, на которые есть права; нет пунктов — нет кнопки.
 * «+»: в папке — папка и пространство (системный администратор), в пространстве — доска (его администратор).
 * «⋯»: действия «Структуры» (системный администратор) — те же запросы и проверки (useStructureActions),
 * в том числе архив и удаление навсегда папки и пространства (LATER-43).
 */
export function TreeNodeActions({
  node,
  depth,
  isSystemAdmin,
  structure,
  onAddSpace,
  onAddBoard,
}: {
  node: NavTreeNode
  /** Глубина строки в дереве: 0 — корень. */
  depth: number
  isSystemAdmin: boolean
  structure: StructureActions
  onAddSpace: (folder: { id: string; name: string }) => void
  onAddBoard: (spaceKey: string) => void
}) {
  const { t } = useTranslation('spaces')
  const name = node.type === 'folder' ? node.name : node.space.name
  const adminNode = isSystemAdmin ? structure.nodeById(node.id) : undefined
  const canAddInFolder = isSystemAdmin && node.type === 'folder'
  const canAddBoard = node.type === 'space' && node.can_manage
  // Вложенная папка — на уровень глубже этой папки (уровни считаются с 1)
  const tooDeep = depth + 2 > structure.maxDepth
  const { first, last } = adminNode ? structure.position(adminNode) : { first: true, last: true }
  // Удалить можно только папку без вложенных папок и пространств (в том числе архивных и недоступных) — по
  // полному дереву «Структуры»; пустые папки в дереве видит только Владелец (ADR-0017)
  const folderNotEmpty = node.type === 'folder' && !!adminNode && structure.hasChildren(adminNode)

  if (!canAddInFolder && !canAddBoard && !adminNode) return null

  return (
    // Видны при наведении, при фокусе с клавиатуры (:focus-visible, а не любой фокус: после закрытия меню
    // мышью фокус возвращается на «+», и кнопки не должны оставаться) и пока открыто меню — по aria-expanded:
    // data-state у кнопки — состояние подсказки, оно перекрывает состояние меню
    <div className="bg-accent absolute top-1 right-1 flex items-center gap-0.5 rounded opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100">
      {(canAddInFolder || canAddBoard) && (
        <DropdownMenu>
          <TriggerHint label={t('tree.node.add', { name })}>
            <DropdownMenuTrigger className={buttonClass} aria-label={t('tree.node.add', { name })}>
              <Plus className="size-4" />
            </DropdownMenuTrigger>
          </TriggerHint>
          <DropdownMenuContent align="start">
            {node.type === 'folder' ? (
              <>
                <DropdownMenuItem
                  disabled={tooDeep}
                  title={tooDeep ? t('tree.node.tooDeep', { max: structure.maxDepth }) : undefined}
                  onSelect={() =>
                    structure.edit({ mode: 'create', parent: { id: node.id, name: node.name } })
                  }
                >
                  <FolderPlus />
                  {t('tree.node.addFolder')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddSpace({ id: node.id, name: node.name })}>
                  <SquarePlus />
                  {t('tree.node.addSpace')}
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => onAddBoard(node.space.key)}>
                <SquareKanban />
                {t('tree.node.addBoard')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {adminNode && (
        <DropdownMenu>
          <TriggerHint label={t('tree.node.menu', { name })}>
            <DropdownMenuTrigger className={buttonClass} aria-label={t('tree.node.menu', { name })}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
          </TriggerHint>
          <DropdownMenuContent align="start">
            {node.type === 'folder' && (
              <DropdownMenuItem
                onSelect={() =>
                  structure.edit({ mode: 'folder', id: node.id, name, icon: node.icon })
                }
              >
                <Pencil />
                {t('tree.node.rename')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => structure.edit({ mode: 'icon', id: node.id, name, icon: node.icon })}
            >
              <Smile />
              {t('tree.node.icon')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => structure.move(adminNode)}>
              <FolderInput />
              {t('tree.node.move')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={first} onSelect={() => structure.shift(adminNode, -1)}>
              <ArrowUp />
              {t('tree.node.up')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={last} onSelect={() => structure.shift(adminNode, 1)}>
              <ArrowDown />
              {t('tree.node.down')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => structure.archive(adminNode)}>
              <Archive />
              {t('tree.node.archive')}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={folderNotEmpty}
              title={folderNotEmpty ? t('tree.node.deleteNotEmpty') : undefined}
              onSelect={() => structure.remove(adminNode)}
            >
              <Trash2 />
              {t('tree.node.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
