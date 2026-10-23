import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { History, MessageSquare } from 'lucide-react'
import { useBlocker, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { closeMentionPopup, RICH_TEXT_POPUP_ATTRIBUTE } from '@/shared/components/rich-text/popup'
import type { CardDetail } from '@/shared/types/api'
import { Alert } from '@/shared/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import {
  cardDepthOf,
  CardWindowContext,
  focusCardWindow,
  type AddKind,
  type CardWindowApi,
} from '../cardWindow'
import { useCard } from '../queries'
import { useAttachmentUpload } from '../useAttachmentUpload'
import { CardActionsRow } from './CardActionsRow'
import { CardAttachmentsSection } from './CardAttachmentsSection'
import { CardActiveBlocks, CardBlocksHistory } from './CardBlocks'
import { CardChecklistsSection } from './CardChecklistsSection'
import { CardCommentsSection } from './CardCommentsSection'
import { CardDescriptionSection } from './CardDescriptionSection'
import { CardHistory } from './CardHistory'
import { CardInfoSection } from './CardInfoSection'
import { CardLinksSection } from './CardLinksSection'
import { CardMainParams } from './CardMainParams'
import { CardRelationsSection } from './CardRelationsSection'
import { CardSection } from './CardSection'
import { CardWindowHeader } from './CardWindowHeader'
import { MoveCardDialog } from './MoveCardDialog'

const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'image',
])

/**
 * Окно закрылось, а фокусу некуда вернуться (окно открыли по прямой ссылке — до него фокуса на странице не было): фокус —
 * на плитку этой карточки, если она на доске, а не в body (U-10 UX-ревью UI-1a). Страница под окном после закрытия
 * может ещё дорисовываться — несколько кадров ждём плитку; фокус уже где-то есть (вернули на плитку, с которой открыли,
 * пользователь щёлкнул) — не трогаем.
 */
function focusTileAfterClose(cardKey: string) {
  let frames = 30
  const attempt = () => {
    if (document.activeElement && document.activeElement !== document.body) return
    const tile = document.querySelector<HTMLElement>(`[data-card-tile="${CSS.escape(cardKey)}"]`)
    if (tile) tile.focus()
    else if (--frames > 0) requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

/** Поле, в котором печатают текст: первый Esc в нём выводит из поля, а не закрывает окно. */
function isTextEntry(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true
  return element instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(element.type)
}

/**
 * Окно карточки (README Kaiten, раздел 02; UI-1a): большое модальное окно поверх доски или страницы пространства со
 * своим адресом (`/cards/KEY-N`, `/spaces/KEY/cards/KEY-N`); на узком экране — на весь экран.
 *
 * Закрытие (Esc, щелчок мимо окна, ✕, «Назад») — переход по адресу: окно, открытое с доски, закрывается шагом назад
 * по истории (доска на том же месте), открытое по прямой ссылке — заменой адреса на `backTo`. Пока в окне есть
 * несохранённый текст, переход перехватывает `useBlocker` и спрашивает «Закрыть без сохранения?» (решение PM к UI-1a).
 */
export function CardWindow({ cardKey, backTo }: { cardKey: string; backTo: string }) {
  const { t } = useTranslation('boards')
  const { t: tc } = useTranslation()
  const card = useCard(cardKey).data
  const navigate = useNavigate()
  const location = useLocation()
  const depth = cardDepthOf(location)

  const unsaved = useRef(new Set<string>())
  const discard = useRef(false)
  // Закрытие уже начато с этой записи истории: повтор (двойной Esc во время перерисовки) ушёл бы ещё на шаг назад
  const closing = useRef<string | null>(null)
  // Последнее поле с текстом, где был фокус: «Продолжить редактирование» возвращает туда (просьба PM к UI-1a)
  const lastField = useRef<HTMLElement | null>(null)
  const api = useMemo<CardWindowApi>(
    () => ({
      setUnsaved: (id, value) => {
        if (value) unsaved.current.add(id)
        else unsaved.current.delete(id)
      },
    }),
    [],
  )
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        !discard.current &&
        unsaved.current.size > 0 &&
        currentLocation.pathname !== nextLocation.pathname &&
        // Сессия закончилась — на вход без вопроса
        nextLocation.pathname !== '/login',
      [],
    ),
  )

  const close = useCallback(() => {
    if (closing.current === location.key) return
    closing.current = location.key
    if (depth > 0) void navigate(-depth)
    else void navigate(backTo, { replace: true })
  }, [backTo, depth, location.key, navigate])
  // Карточку удалили в корзину — несохранённому тексту некуда сохраняться, вопроса нет
  const closeDeleted = useCallback(() => {
    discard.current = true
    close()
  }, [close])

  const onEscapeKeyDown = (event: KeyboardEvent) => {
    // Окно закрывается только переходом (close): так его закрытие проходит через проверку несохранённого текста
    event.preventDefault()
    if (closeMentionPopup()) return
    const active = document.activeElement
    if (isTextEntry(active) && active.closest('[data-card-window]')) {
      // Первый Esc выводит из поля — текст остаётся; поле со своей отменой (название) отменяет правку само
      if (!active.hasAttribute('data-own-escape')) focusCardWindow(active)
      return
    }
    close()
  }

  return (
    <CardWindowContext.Provider value={api}>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          data-card-window
          closeLabel={tc('actions.close')}
          // ✕ — вровень со строкой названия: её центр — 20 px поля и половина строки (U-12 UX-ревью UI-1a)
          closeClassName="top-5"
          // Окно у верха экрана, высота — по содержимому, не выше экрана (прокручивается содержимое). 4rem — поля
          // сверху и снизу, как у верхнего края; на узком экране окно — на весь экран
          className="top-4 flex max-h-[calc(100dvh-2rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 outline-none max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none max-sm:border-0 sm:top-8 sm:max-h-[calc(100dvh-4rem)] sm:max-w-3xl"
          onOpenAutoFocus={(event) => {
            // Фокус — на окне, а не в первом поле (названии): иначе первая нажатая клавиша правила бы название
            event.preventDefault()
            ;(event.currentTarget as HTMLElement | null)?.focus()
          }}
          onEscapeKeyDown={onEscapeKeyDown}
          onCloseAutoFocus={() => focusTileAfterClose(cardKey)}
          onFocusCapture={(event) => {
            const target = event.target as Element
            if (isTextEntry(target)) lastField.current = target
          }}
          onKeyDown={(event) => {
            // Фокус на самом окне (сразу после открытия): Shift+Tab — на последний элемент окна, а не на доску под ним
            // (LATER-96). С элементов окна Tab и Shift+Tab ходят по кругу сами (FocusScope)
            if (event.key !== 'Tab' || !event.shiftKey || event.target !== event.currentTarget)
              return
            const last = lastTabbable(event.currentTarget)
            if (!last) return
            event.preventDefault()
            last.focus()
          }}
          onInteractOutside={(event) => {
            // Список подсказки @ — вне окна, но щелчок по нему — не «мимо окна» (уведомления — так у всех окон, DialogContent)
            const target = event.target
            if (target instanceof Element && target.closest(`[${RICH_TEXT_POPUP_ATTRIBUTE}]`))
              event.preventDefault()
          }}
        >
          {card ? (
            <CardWindowBody key={card.key} card={card} onDeleted={closeDeleted} />
          ) : (
            <div className="grid gap-2 p-6">
              <DialogTitle className="font-mono text-base">{cardKey}</DialogTitle>
              <DialogDescription>{tc('states.loading')}</DialogDescription>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (open) return
          // Остаёмся в окне — следующее закрытие снова возможно
          closing.current = null
          blocker.reset?.()
        }}
        title={t('card.unsavedTitle')}
        description={t('card.unsavedText')}
        confirmLabel={t('card.unsavedConfirm')}
        cancelLabel={t('card.unsavedCancel')}
        onConfirm={() => blocker.proceed?.()}
        onCloseAutoFocus={(event) => {
          // Остались в окне — курсор снова в поле, где несохранённый текст (закрыли — поля уже нет)
          const field = lastField.current
          if (!field?.isConnected) return
          event.preventDefault()
          field.focus()
        }}
      />
    </CardWindowContext.Provider>
  )
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex], [contenteditable="true"]'

/** Последний элемент окна, на который встаёт Tab: видимый и не исключённый из порядка Tab. */
function lastTabbable(container: HTMLElement): HTMLElement | null {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE))
  return (
    candidates
      .reverse()
      .find((element) => element.tabIndex >= 0 && element.getClientRects().length > 0) ?? null
  )
}

const isRelation = (kind: AddKind) => kind === 'parent' || kind === 'child'

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

/** Содержимое окна: шапка, ряд действий, секции, вкладки «Комментарии» и «История». */
function CardWindowBody({ card, onDeleted }: { card: CardDetail; onDeleted: () => void }) {
  const { t } = useTranslation('boards')
  const canEdit = card.permissions.edit && !card.archived_at
  const canAttach = card.permissions.comment && !card.archived_at
  // Открытые формы «+» — каждая своя: начатая причина блокировки не пропадает, если добавить ещё и ссылку
  const [adding, setAdding] = useState<AddKind[]>([])
  const [moving, setMoving] = useState(false)
  // Файл над окном: счётчик входов-выходов по элементам — в ref, в состоянии только «да/нет» (меньше перерисовок)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { upload, uploads } = useAttachmentUpload(card.key)
  const isAdding = (kind: AddKind) => adding.includes(kind)
  const add = (kind: AddKind) =>
    setAdding((list) => [
      ...list.filter((item) => item !== kind && !(isRelation(kind) && isRelation(item))),
      kind,
    ])
  const addDone = (...kinds: AddKind[]) =>
    setAdding((list) => list.filter((item) => !kinds.includes(item)))

  // Переход к связанной карточке: тело окна пересоздано, ссылка с фокусом исчезла — фокус на окно
  useEffect(() => {
    const dialog = document.querySelector<HTMLElement>('[data-card-window]')
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
  }, [])

  const uploadFiles = async (files: File[]) => {
    for (const file of files) {
      if (await upload(file)) toast.success(t('attachments.uploaded', { name: file.name }))
    }
  }

  const relationKind = adding.find(isRelation) ?? null
  const ended = card.blocks.filter((block) => block.ended_at).length
  const { parents, children } = card.relations

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      // Файл можно бросить на любое место окна (пустых секций нет — решение PM к UI-1a); в редактор текста — туда
      // вставит сам редактор (картинку — в текст)
      onDragEnter={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = canAttach ? 'copy' : 'none'
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        dragDepth.current = 0
        setDragging(false)
        if (event.defaultPrevented) return
        event.preventDefault()
        if (canAttach) void uploadFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 px-4 pt-5 pb-6 sm:px-6">
          <CardWindowHeader card={card} canEdit={canEdit} />
          {card.archived_at && <Alert>{t('card.archived')}</Alert>}
          <CardActionsRow
            card={card}
            canEdit={canEdit}
            canAttach={canAttach}
            onAdd={add}
            onPickFiles={() => fileInput.current?.click()}
            onMove={() => setMoving(true)}
            onDeleted={onDeleted}
          />
          <CardActiveBlocks
            card={card}
            canEdit={canEdit}
            adding={isAdding('block')}
            onAddDone={() => addDone('block')}
          />

          <CardSection
            id="main"
            title={t('sections.main')}
            forceOpen={isAdding('due') || isAdding('labels') || isAdding('estimate')}
          >
            <CardMainParams
              card={card}
              canEdit={canEdit}
              onMove={() => setMoving(true)}
              adding={adding}
              onAddDone={(kind) => {
                addDone(kind)
                // Срок, метки или план так и не задали — строка пропала вместе с кнопкой, куда вернулся бы фокус: на окно
                requestAnimationFrame(() => {
                  const dialog = document.querySelector<HTMLElement>('[data-card-window]')
                  if (dialog && !dialog.contains(document.activeElement)) dialog.focus()
                })
              }}
            />
          </CardSection>
          <CardDescriptionSection card={card} canEdit={canEdit} />

          {(card.checklists.length > 0 || (canEdit && isAdding('checklist'))) && (
            <CardSection
              id="checklists"
              title={t('sections.checklists')}
              count={card.checklists.length}
              forceOpen={isAdding('checklist')}
            >
              <CardChecklistsSection
                card={card}
                canEdit={canEdit}
                adding={isAdding('checklist')}
                onAdd={() => add('checklist')}
                onAddDone={() => addDone('checklist')}
              />
            </CardSection>
          )}
          {(parents.length > 0 || children.length > 0 || (canEdit && relationKind)) && (
            <CardSection
              id="relations"
              title={t('sections.relations')}
              count={parents.length + children.length}
              forceOpen={relationKind !== null}
            >
              <CardRelationsSection
                card={card}
                canEdit={canEdit}
                adding={relationKind}
                onAdd={add}
                onAddDone={() => addDone('parent', 'child')}
              />
            </CardSection>
          )}
          {ended > 0 && (
            <CardSection id="blocks" title={t('sections.blocks')} count={ended}>
              <CardBlocksHistory card={card} />
            </CardSection>
          )}
          {(card.attachments.length > 0 || uploads.length > 0) && (
            <CardSection
              id="attachments"
              title={t('sections.attachments')}
              count={card.attachments.length}
              forceOpen={uploads.length > 0}
            >
              <CardAttachmentsSection
                card={card}
                canAttach={canAttach}
                uploads={uploads}
                onPickFiles={() => fileInput.current?.click()}
              />
            </CardSection>
          )}
          {(card.links.length > 0 || (canEdit && isAdding('link'))) && (
            <CardSection
              id="links"
              title={t('sections.links')}
              count={card.links.length}
              forceOpen={isAdding('link')}
            >
              <CardLinksSection
                card={card}
                canEdit={canEdit}
                adding={isAdding('link')}
                onAdd={() => add('link')}
                onAddDone={() => addDone('link')}
              />
            </CardSection>
          )}
          <CardSection id="info" title={t('sections.info')} defaultOpen={false}>
            <CardInfoSection card={card} />
          </CardSection>

          <Tabs defaultValue="comments" className="gap-4 pt-2">
            <TabsList className="self-start">
              <TabsTrigger value="comments">
                <MessageSquare />
                {t('sections.comments')}
              </TabsTrigger>
              <TabsTrigger value="history">
                <History />
                {t('sections.history')}
              </TabsTrigger>
            </TabsList>
            {/* Комментарии не размонтируются на «Истории»: набранный текст не пропадает. tabIndex — без остановки Tab
                на самой панели: внутри свои элементы с фокусом (правила вида, раздел 11) */}
            <TabsContent
              value="comments"
              forceMount
              tabIndex={undefined}
              className="data-[state=inactive]:hidden"
            >
              <CardCommentsSection card={card} />
            </TabsContent>
            <TabsContent value="history" tabIndex={undefined}>
              <CardHistory cardKey={card.key} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {canAttach && dragging && (
        <div
          aria-hidden
          className="border-primary bg-background/90 pointer-events-none absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed text-sm font-medium"
        >
          {t('card.dropFiles')}
        </div>
      )}
      {canAttach && (
        <input
          ref={fileInput}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-label={t('attachments.choose')}
          onChange={async (event) => {
            const input = event.currentTarget
            await uploadFiles(Array.from(input.files ?? []))
            input.value = ''
          }}
        />
      )}
      {moving && <MoveCardDialog card={card} onClose={() => setMoving(false)} />}
    </div>
  )
}
