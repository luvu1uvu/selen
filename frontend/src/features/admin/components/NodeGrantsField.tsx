import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { RolesField } from '@/features/spaces/components/RolesField'
import type { GrantableNode, NodeGrantInput } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { NativeSelect } from '@/shared/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { useGrantableNodes } from '../queries'

/**
 * Доступ к папкам и пространствам с ролями — в приглашении (по желанию) и у гостя (П2c, аудит Kaiten; папки и несколько
 * ролей — П2d-1): строки «папка или пространство — роли чипами». В списке — узлы компании, где автор может выдавать
 * доступ, в порядке дерева с отступом; гостю — только пространства и роли без «Администратора» (forGuest). emptyText —
 * что сказать, пока строк нет (у гостя доступ обязателен).
 *
 * Фокус не теряется (правила вида, раздел 11): добавили строку — на её выбор места; убрали — на × соседней строки,
 * иначе на «Добавить»; сменили место (строка пересоздаётся) — снова на него.
 */
export function NodeGrantsField({
  id,
  company,
  value,
  onChange,
  forGuest = false,
  emptyText,
  error,
}: {
  id: string
  company: string
  value: NodeGrantInput[]
  onChange: (value: NodeGrantInput[]) => void
  forGuest?: boolean
  emptyText?: string
  error?: string
}) {
  const { t } = useTranslation('admin')
  const nodes = useGrantableNodes(company)
  const available = (nodes.data ?? []).filter((node) => !forGuest || node.type === 'space')
  const used = new Set(value.map((grant) => grant.node_id))
  const next = available.find((node) => !used.has(node.id))

  // Куда поставить фокус после изменения строк: data-focus элемента (`node:<id>`, `remove:<id>`, `add`)
  const root = useRef<HTMLFieldSetElement>(null)
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (pendingFocus.current === null) return
    root.current?.querySelector<HTMLElement>(`[data-focus="${pendingFocus.current}"]`)?.focus()
    pendingFocus.current = null
  })

  const label = (node: GrantableNode) =>
    node.space ? `${node.name} (${node.space.key})` : t('nodeGrants.folder', { name: node.name })
  const nodeName = (nodeId: string) => {
    const node = available.find((item) => item.id === nodeId)
    return node ? label(node) : ''
  }
  const update = (index: number, patch: Partial<NodeGrantInput>) =>
    onChange(value.map((grant, i) => (i === index ? { ...grant, ...patch } : grant)))
  const remove = (index: number) => {
    const neighbour = value[index + 1] ?? value[index - 1]
    pendingFocus.current = neighbour ? `remove:${neighbour.node_id}` : 'add'
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <fieldset
      ref={root}
      className="grid gap-3"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-1 text-sm font-medium">
        {t(forGuest ? 'nodeGrants.labelSpaces' : 'nodeGrants.label')}
      </legend>
      {value.length === 0 && available.length > 0 && !error && (
        <p className="text-muted-foreground text-sm">{emptyText ?? t('nodeGrants.empty')}</p>
      )}
      {value.map((grant, index) => {
        const name = nodeName(grant.node_id)
        return (
          <div key={grant.node_id} className="grid gap-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <NativeSelect
                data-focus={`node:${grant.node_id}`}
                aria-label={t(forGuest ? 'nodeGrants.space' : 'nodeGrants.node')}
                value={grant.node_id}
                onChange={(event) => {
                  pendingFocus.current = `node:${event.target.value}`
                  update(index, { node_id: event.target.value })
                }}
                className="min-w-40 flex-1"
              >
                {available
                  .filter((node) => node.id === grant.node_id || !used.has(node.id))
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {`${'  '.repeat(forGuest ? 0 : node.depth - 1)}${label(node)}`}
                    </option>
                  ))}
              </NativeSelect>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-focus={`remove:${grant.node_id}`}
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('nodeGrants.remove', { name })}
                    onClick={() => remove(index)}
                  >
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('nodeGrants.remove', { name })}</TooltipContent>
              </Tooltip>
            </div>
            <RolesField
              id={`${id}-roles-${index}`}
              label={t('nodeGrants.rolesIn', { name })}
              value={grant.roles}
              onChange={(roles) => update(index, { roles })}
              withoutManaging={forGuest}
              showHints={false}
            />
          </div>
        )
      })}
      {next && (
        <Button
          data-focus="add"
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            pendingFocus.current = `node:${next.id}`
            onChange([...value, { node_id: next.id, roles: [forGuest ? 'commenter' : 'editor'] }])
          }}
        >
          <Plus />
          {t(forGuest ? 'nodeGrants.addSpace' : 'nodeGrants.add')}
        </Button>
      )}
      {!nodes.isPending && available.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t(forGuest ? 'nodeGrants.noneSpaces' : 'nodeGrants.none')}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </fieldset>
  )
}
