import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { CardPanel } from '@/features/cards/components/CardPanel'
import { useCard } from '@/features/cards/queries'
import { getErrorStatus } from '@/shared/api/errors'
import { NotFoundState } from '@/shared/components/NotFoundState'
import { useScrollMemory } from '@/shared/lib/useScrollMemory'
import { Alert } from '@/shared/ui/alert'
import { BoardBlock } from './components/BoardBlock'
import { useBoard } from './queries'

/**
 * Доска (/boards/:boardId) и та же доска с открытой карточкой (/cards/:cardKey).
 * Чужая или несуществующая доска/карточка — «не найдено».
 *
 * Страница — холст (ADR-0019): верхняя панель приложения на месте, холст прокручивается по вертикали, доска
 * занимает его до низа; шапка доски и заголовки колонок закреплены вверху холста.
 */
export function BoardPage() {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const { boardId: boardParam, cardKey } = useParams()
  const navigate = useNavigate()
  const cardQuery = useCard(cardKey)
  const resolvedBoardId = boardParam ?? cardQuery.data?.board.id
  // Пока грузится карточка, открытая поверх доски, доска остаётся на месте (с прежней прокруткой), а не
  // сменяется «Загрузкой»: id доски — от прежнего адреса, пока не придёт карточка
  const [shownBoardId, setShownBoardId] = useState(resolvedBoardId)
  if (resolvedBoardId && resolvedBoardId !== shownBoardId) setShownBoardId(resolvedBoardId)
  const boardId = resolvedBoardId ?? (cardKey ? shownBoardId : undefined)
  const boardQuery = useBoard(boardId)
  const canvasRef = useRef<HTMLDivElement>(null)
  // Неудачное фоновое обновление уже показанной доски её не прячет; «не найдено» (доску удалили) — прячет
  const boardMissing = boardQuery.isError && getErrorStatus(boardQuery.error) === 404
  const board = boardMissing ? undefined : boardQuery.data
  const cardMissing = !!cardKey && cardQuery.isError
  // Открытая поверх карточка — та же страница: прокрутка доски под ней не сбрасывается
  useScrollMemory(canvasRef, {
    name: 'canvas',
    page: `board:${board?.id}`,
    ready: !!board && !cardMissing,
  })

  if (cardMissing) {
    return getErrorStatus(cardQuery.error) === 404 ? (
      <PageMessage>
        <NotFoundState title={t('card.notFound')} text={t('card.notFoundText')} />
      </PageMessage>
    ) : (
      <PageMessage>
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      </PageMessage>
    )
  }

  if (boardQuery.isError && !board) {
    return boardMissing ? (
      <PageMessage>
        <NotFoundState title={t('board.notFound')} text={t('board.notFoundText')} />
      </PageMessage>
    ) : (
      <PageMessage>
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      </PageMessage>
    )
  }

  if (!board) {
    return (
      <PageMessage>
        <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
      </PageMessage>
    )
  }

  return (
    <>
      {/* Холст: вертикальная прокрутка страницы досок. Отступ под закреплённые шапку доски и заголовки колонок
          при прокрутке к элементу задаёт сама доска (scroll-margin, её высота шапок своя) */}
      <div
        ref={canvasRef}
        className="bg-canvas relative min-h-0 flex-1 scroll-pb-6 overflow-x-hidden overflow-y-auto"
        data-board-canvas
      >
        <div className="flex min-h-full flex-col gap-3 p-3 md:p-4">
          {board.archived_at && <Alert>{t('board.archived')}</Alert>}
          {!board.has_done_column && <Alert>{t('board.noDoneColumn')}</Alert>}
          {/* Другая доска — новый блок: состояние прокрутки, перетаскивания и полосы внизу не переходит с доски на доску
              (LATER-66); карточка поверх той же доски блок не пересоздаёт */}
          <BoardBlock
            key={board.id}
            board={board}
            heading="h1"
            breadcrumb={
              <>
                {/* На узком экране — только название доски: ссылка на пространство съела бы его целиком */}
                <Link
                  to={`/spaces/${board.space.key}`}
                  className="text-muted-foreground hidden max-w-48 shrink-0 truncate text-sm hover:underline sm:block"
                >
                  {board.space.name}
                </Link>
                <span aria-hidden className="text-muted-foreground hidden text-sm sm:inline">
                  /
                </span>
              </>
            }
            onOpenCard={(key) => navigate(`/cards/${key}`)}
          />
        </div>
      </div>

      {cardKey && <CardPanel cardKey={cardKey} onClose={() => navigate(`/boards/${board.id}`)} />}
    </>
  )
}

/** Сообщение вместо доски: страница-холст без отступов каркаса — отступы свои. */
function PageMessage({ children }: { children: ReactNode }) {
  return <div className="overflow-y-auto p-4 md:p-8">{children}</div>
}
