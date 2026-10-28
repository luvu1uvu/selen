import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/features/auth/queries'
import { Pagination } from '@/shared/components/Pagination'
import { formatDateTime } from '@/shared/lib/dates'
import { isMultiCompany } from '@/shared/lib/roles'
import { NativeSelect } from '@/shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { EVENT_TYPES, eventTypeKey, MULTI_COMPANY_EVENT_TYPES } from './eventTypes'
import { useEvents } from './queries'

export function EventLogPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const [eventType, setEventType] = useState('')
  const [page, setPage] = useState(1)
  const eventsQuery = useEvents({ event_type: eventType || undefined, page })

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
              <TableCell>
                {entry.actor?.name ??
                  (entry.meta.source === 'http'
                    ? t('events.anonymousActor')
                    : t('events.systemActor'))}
                {entry.auth_audit?.ip && (
                  <div className="text-muted-foreground font-mono text-xs">
                    {t('events.ip', { ip: entry.auth_audit.ip })}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">
                {entry.subject_type ? `${entry.subject_type}:${entry.subject_id}` : '—'}
              </TableCell>
              <TableCell className="hidden max-w-md truncate font-mono text-xs lg:table-cell">
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
