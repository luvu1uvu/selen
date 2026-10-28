import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import { isMultiCompany } from '@/shared/lib/roles'
import { describeUserAgent } from '@/shared/lib/userAgent'
import type { EventLogEntry } from '@/shared/types/api'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { EVENT_TYPES, eventTypeKey, MULTI_COMPANY_EVENT_TYPES } from './eventTypes'
import { useEventPeople, useEvents } from './queries'

/**
 * Журнал событий компании: фильтры по типу и по человеку (П2c-2 — что он сделал и что сделали с ним); у событий входа —
 * IP и браузер (решение PM 28.10: видят все, у кого право «журнал»). «Подробности» переносятся по словам, а не
 * обрезаются: на 1280 таблица помещается без прокрутки вбок (LATER-142).
 */
export function EventLogPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [eventType, setEventType] = useState('')
  const [userId, setUserId] = useState('')
  const [page, setPage] = useState(1)
  const eventsQuery = useEvents({
    event_type: eventType || undefined,
    user_id: userId || undefined,
    page,
  })
  const people = useEventPeople()

  const label = (type: string) => t(eventTypeKey(type) as never, { defaultValue: type })
  const types = isMultiCompany(me)
    ? EVENT_TYPES
    : EVENT_TYPES.filter((type) => !MULTI_COMPANY_EVENT_TYPES.has(type))

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('events.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('events.description')}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <NativeSelect
          aria-label={t('events.filterType')}
          value={eventType}
          onChange={(event) => {
            setEventType(event.target.value)
            setPage(1)
          }}
          className="sm:w-72"
        >
          <option value="">{t('events.allTypes')}</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {label(type)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label={t('events.filterUser')}
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value)
            setPage(1)
          }}
          className="sm:w-72"
        >
          <option value="">{t('events.allUsers')}</option>
          {(people.data ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {eventsQuery.isError && <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('events.columns.time')}</TableHead>
            <TableHead>{t('events.columns.event')}</TableHead>
            <TableHead>{t('events.columns.actor')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('events.columns.subject')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('events.columns.details')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {eventsQuery.data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                {tc('states.empty')}
              </TableCell>
            </TableRow>
          )}
          {eventsQuery.data?.data.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap">
                {formatDateTime(entry.occurred_at, me?.timezone)}
              </TableCell>
              <TableCell>{label(entry.event_type)}</TableCell>
              <TableCell className="min-w-40">
                {entry.actor?.name ??
                  (entry.meta.source === 'http'
                    ? t('events.anonymousActor')
                    : t('events.systemActor'))}
                {entry.auth_audit && <AuthAudit audit={entry.auth_audit} />}
              </TableCell>
              <TableCell className="hidden min-w-40 font-mono text-xs break-all whitespace-normal md:table-cell">
                {entry.subject_type ? `${entry.subject_type}:${entry.subject_id}` : '—'}
              </TableCell>
              {/* Весь текст — в ячейке, переносом (LATER-142): длинные id и значения без пробелов тоже переносятся */}
              <TableCell className="hidden min-w-48 font-mono text-xs break-all whitespace-normal lg:table-cell">
                {JSON.stringify(entry.payload)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {eventsQuery.data && <Pagination meta={eventsQuery.data.meta} onPageChange={setPage} />}
    </div>
  )
}

/** IP и браузер события входа: браузер — коротко, полная строка User-Agent — в подсказке по наведению и фокусу. */
function AuthAudit({ audit }: { audit: NonNullable<EventLogEntry['auth_audit']> }) {
  const { t } = useTranslation('admin')
  const browser = describeUserAgent(audit.user_agent)

  return (
    <div className="text-muted-foreground grid text-xs">
      {audit.ip && (
        <span className="font-mono whitespace-nowrap">{t('events.ip', { ip: audit.ip })}</span>
      )}
      {audit.user_agent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="w-fit whitespace-nowrap">
              {browser ?? t('events.unknownBrowser')}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm font-mono break-all">
            {audit.user_agent}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
