import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { useCurrentUser } from '@/features/auth/queries'
import { ActionsMenu } from '@/shared/components/ActionsMenu'
import { isOwner } from '@/shared/lib/roles'
import type { Company } from '@/shared/types/api'
import { Button } from '@/shared/ui/button'
import { DropdownMenuItem } from '@/shared/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { adminUrl } from './company'
import { CompanyAdminsDialog } from './components/CompanyAdminsDialog'
import { CompanyDialog } from './components/CompanyDialog'
import { useCompanies } from './queries'

/**
 * Администрирование → «Компании» — экран Владельца (ADR-0024, LATER-11): список компаний с людьми и администраторами,
 * создание (справочники — из шаблона: «Все сотрудники» и четыре типа карточек), переименование, администраторы
 * компании. Компании не удаляются и не архивируются.
 */
export function CompaniesPage() {
  const { t } = useTranslation('admin')
  const { t: tc } = useTranslation()
  const { data: me } = useCurrentUser()
  const owner = isOwner(me)
  const companiesQuery = useCompanies(owner)
  const [editing, setEditing] = useState<Company | 'new' | null>(null)
  const [adminsOf, setAdminsOf] = useState<string | null>(null)

  if (!owner) return <Navigate to="/" replace />

  const companies = companiesQuery.data ?? []

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold">{t('companies.title')}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{t('companies.description')}</p>
        </div>
        <Button onClick={() => setEditing('new')}>{t('companies.create')}</Button>
      </div>

      {companiesQuery.isError && (
        <p className="text-destructive text-sm">{tc('errors.loadFailed')}</p>
      )}
      {companiesQuery.isPending && (
        <p className="text-muted-foreground text-sm">{tc('states.loading')}</p>
      )}

      {companiesQuery.isSuccess && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('companies.columns.name')}</TableHead>
              <TableHead className="w-32">{t('companies.columns.people')}</TableHead>
              <TableHead>{t('companies.columns.admins')}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t('companies.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">
                  <Link to={adminUrl(company.id, 'users')} className="hover:underline">
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell>{company.people_count}</TableCell>
                <TableCell className="text-sm">
                  {company.admins.length === 0 ? (
                    <span className="text-muted-foreground">{t('companies.admins.none')}</span>
                  ) : (
                    company.admins.map((admin) => admin.name).join(', ')
                  )}
                </TableCell>
                <TableCell>
                  <ActionsMenu label={t('companies.actions.menu', { name: company.name })}>
                    {(dialog) => (
                      <>
                        <DropdownMenuItem onSelect={dialog(() => setEditing(company))}>
                          {t('companies.actions.rename')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={dialog(() => setAdminsOf(company.id))}>
                          {t('companies.actions.admins')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </ActionsMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CompanyDialog company={editing} onClose={() => setEditing(null)} />
      <CompanyAdminsDialog companyId={adminsOf} onClose={() => setAdminsOf(null)} />
    </div>
  )
}
