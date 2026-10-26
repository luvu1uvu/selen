<?php

namespace App\Services\Access;

use App\Enums\AccessInactiveReason;
use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\StandardRole;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Единая точка прав (docs/adr/0024-rights-2.md, ADR-0012): единственное место, где для вычисления доступа читаются
 * членство в компаниях (company_members), выдачи (access_grants), состав групп (group_members), роли и их права
 * (roles, role_permissions). Политики, CardVisibility, списки пространств, участники, подсказка @, админка компаний
 * получают права только отсюда — напрямую или через Space::accessOf() и Company::permissionsOf().
 *
 * Изоляция компаний — здесь же (одно правило, раздел 2 плана): выдача действует, только если её получатель —
 * действующий участник компании выдачи (её «дом» или Владелец, activeMember()). Каждая ветка выборки источников
 * соединяется с этим правилом по компании выдачи; строка выдачи человеку без членства ничего не даёт.
 *
 * Действующий источник — выдача на узел пространства: личная; группе — если она не в архиве, а пользователь
 * не деактивирован; встроенной группе «Все сотрудники» компании — каждому активному «дому» этой компании (её состав
 * не хранится, а вычисляется здесь: новый сотрудник получает доступ сразу после принятия приглашения,
 * деактивированный теряет его сразу). Права источника — права его роли; права ролей приходят тем же запросом,
 * что и выдачи.
 */
class AccessResolver
{
    /** Вид членства «дом» — полноправный сотрудник компании (гости — П2c). */
    public const HOME = 'home';

    /** Права пользователя в одном пространстве — один запрос. Кеширует Space::accessOf(). */
    public function forSpace(User $user, Space $space): SpaceAccess
    {
        return $this->toAccess($this->withRoles($this->sourceRows(spaceId: $space->getKey(), userId: $user->getKey()))->get());
    }

    /**
     * Права пользователя во всех его пространствах одним запросом (сайдбар, списки): space_id → права.
     *
     * @return Collection<string, SpaceAccess>
     */
    public function forUser(User $user): Collection
    {
        return $this->withRoles($this->sourceRows(userId: $user->getKey()))->get()
            ->groupBy('space_id')
            ->map(fn (Collection $rows) => $this->toAccess($rows));
    }

    /**
     * Все, у кого есть доступ к пространству, одним запросом: user_id → права
     * (вкладка «Люди», подсказка @, выбор людей в карточку).
     *
     * @return Collection<string, SpaceAccess>
     */
    public function usersWithAccess(Space $space): Collection
    {
        return $this->withRoles($this->sourceRows(spaceId: $space->getKey()))->get()
            ->groupBy('user_id')
            ->map(fn (Collection $rows) => $this->toAccess($rows));
    }

    /**
     * Подзапрос id пространств, к которым у пользователя есть доступ (для whereIn).
     */
    public function spaceIdsQuery(User $user): Builder
    {
        return DB::query()->fromSub($this->sourceRows(userId: $user->getKey()), 'access')->select('space_id');
    }

    /**
     * Управляет доступом хотя бы к одному пространству компании (лично или через группу) — справочник сотрудников
     * и групп этой компании для выдачи доступа.
     */
    public function managesAccessIn(User $user, Company $company): bool
    {
        return DB::query()
            ->fromSub($this->sourceRows(userId: $user->getKey(), companyId: $company->getKey()), 'access')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'access.role_id')
            ->where('role_permissions.permission', Permission::SpaceManageAccess->value)
            ->exists();
    }

    /**
     * Права пользователя в компании (Company::permissionsOf): Владелец — участник всех компаний со всеми правами
     * компании; «дом» — участник, администратор компании — с правами по умолчанию (выдача прав компании — П2c).
     */
    public function forCompany(User $user, Company $company): CompanyAccess
    {
        $membership = $user->isOwner() ? null : $this->homes()
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->select('is_admin')
            ->selectSub($this->homes()->selectRaw('count(*)')->where('user_id', $user->getKey()), 'homes')
            ->first();

        return $this->companyAccess($user, $membership === null ? null : (bool) $membership->is_admin, (int) ($membership->homes ?? 0));
    }

    /**
     * Права в компании для списка людей одним запросом (админка «Пользователи», приглашения): запоминаются
     * в Company::permissionsOf().
     *
     * @param  iterable<User>  $users
     */
    public function rememberCompanyPermissions(Company $company, iterable $users): void
    {
        $users = collect($users);
        $ids = $users->map(fn (User $user) => $user->getKey())->all();
        $admins = $this->homes()
            ->where('company_id', $company->getKey())
            ->whereIn('user_id', $ids)
            ->pluck('is_admin', 'user_id');
        $homes = $this->homes()->whereIn('user_id', $ids)->groupBy('user_id')->selectRaw('user_id, count(*) AS homes')
            ->pluck('homes', 'user_id');

        foreach ($users as $user) {
            $flag = $admins->get($user->getKey());
            $company->rememberPermissions($user, $this->companyAccess($user, $flag === null ? null : (bool) $flag, (int) $homes->get($user->getKey(), 0)));
        }
    }

    /**
     * @param  bool|null  $isAdmin  членство: администратор компании или нет; null — не участник
     * @param  int  $homes  во скольких компаниях он «дом» (больше одной — учётной записью управляет только Владелец)
     */
    private function companyAccess(User $user, ?bool $isAdmin, int $homes = 0): CompanyAccess
    {
        if ($user->isOwner()) {
            $all = array_filter(Permission::cases(), fn (Permission $p) => $p->scope() === 'company');

            return new CompanyAccess(member: true, admin: true, owner: true, permissions: $this->permissionSet($all));
        }

        return match ($isAdmin) {
            null => CompanyAccess::none(),
            true => new CompanyAccess(member: true, admin: true, permissions: $this->permissionSet(Permission::companyAdminDefaults()), otherHomes: $homes > 1),
            false => new CompanyAccess(member: true, otherHomes: $homes > 1),
        };
    }

    /**
     * Компании, которыми пользователь управляет как администратор (Владелец — все), по дате создания:
     * /auth/me (frontend — adminCompanies) и User::administers().
     *
     * @return Collection<int, string>
     */
    public function adminCompanyIds(User $user): Collection
    {
        return DB::table('companies')
            ->when(! $user->isOwner(), fn (Builder $q) => $q->whereIn('id', $this->homes()
                ->select('company_id')
                ->where('user_id', $user->getKey())
                ->where('is_admin', true)))
            ->orderBy('created_at')
            ->orderBy('id')
            ->pluck('id');
    }

    /**
     * Для экрана Владельца «Компании»: сколько в каждой компании людей («дома» без деактивированных) и кто её
     * администраторы (по имени, с деактивированными — у них пометка).
     *
     * @return array{people: Collection<string, int>, admins: Collection<string, EloquentCollection<int, User>>}
     */
    public function companiesSummary(): array
    {
        $people = $this->homes()
            ->join('users', 'users.id', '=', 'company_members.user_id')
            ->where('users.status', '!=', UserStatus::Deactivated->value)
            ->groupBy('company_members.company_id')
            ->selectRaw('company_members.company_id, count(*) AS people')
            ->pluck('people', 'company_id')
            ->map(fn (mixed $count) => (int) $count);
        $admins = User::query()
            ->joinSub($this->homes()->where('is_admin', true)->select(['company_id', 'user_id']), 'admins', 'admins.user_id', '=', 'users.id')
            ->orderBy('users.name')
            ->get(['users.*', 'admins.company_id AS admin_company_id'])
            ->groupBy(fn (User $user) => (string) $user->getAttribute('admin_company_id'));

        return ['people' => $people, 'admins' => $admins];
    }

    /**
     * Действующие администраторы компании: Владелец и активные администраторы компании (инвариант «не оставить
     * компанию без администратора», подсказки консоли).
     *
     * @return EloquentBuilder<User>
     */
    public function activeAdmins(Company $company): EloquentBuilder
    {
        return User::query()
            ->where('status', UserStatus::Active)
            ->where(fn (EloquentBuilder $q) => $q
                ->where('role', UserRole::Owner)
                ->orWhereIn('id', $this->companyMemberIds($company)->where('is_admin', true)));
    }

    /**
     * Признак «администратор компании» у людей — под блокировкой строк членства до конца транзакции
     * (UserLock: права, проверенные политикой, не изменились параллельно): user_id → администратор.
     *
     * @param  list<string>  $userIds
     * @return array<string, bool>
     */
    public function lockAdminFlags(Company $company, array $userIds): array
    {
        return $this->homes()
            ->where('company_id', $company->getKey())
            ->whereIn('user_id', $userIds)
            ->orderBy('user_id')
            ->lockForUpdate()
            ->pluck('is_admin', 'user_id')
            ->map(fn (mixed $flag) => (bool) $flag)
            ->all();
    }

    /**
     * Подзапрос id людей компании — её «домов» (состав групп, число людей в «Все сотрудники», события «о человеке»;
     * «Пользователи» и выбор людей для выдачи доступа — companyPeopleIds, с Владельцем).
     */
    public function companyMemberIds(Company|string $company): Builder
    {
        return $this->homes()
            ->select('user_id')
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company);
    }

    /**
     * Подзапрос id людей компании для админки и выдачи доступа: её «дома» и Владелец — он участник всех компаний
     * (ADR-0024: админка компании, личная выдача ему). Привязка {user} в адресах, список «Пользователи», справочник для
     * выдачи доступа. Состав групп и «Все сотрудники» — только «дома» (companyMemberIds), события «о человеке» — тоже.
     */
    public function companyPeopleIds(Company|string $company): Builder
    {
        return $this->companyMemberIds($company)
            ->union(DB::table('users')->select('id AS user_id')->where('role', UserRole::Owner->value));
    }

    /** Пользователь — «дом» компании (Владелец — участник всех компаний, но «дом» — только где он сотрудник). */
    public function isHome(User $user, Company $company): bool
    {
        return $this->homes()->where('company_id', $company->getKey())->where('user_id', $user->getKey())->exists();
    }

    /**
     * Подзапрос id компаний, где пользователь — «дом» (дерево: какие компании ему показывать).
     */
    public function memberCompanyIds(User $user): Builder
    {
        return $this->homes()->select('company_id')->where('user_id', $user->getKey());
    }

    /**
     * Действующее членство (одно правило изоляции компаний): пользователь из колонки $user — «дом» компании из колонки
     * $company или Владелец (он участник всех компаний — чтобы ему можно было выдать доступ, ADR-0024).
     * Гости, срок гостя и «убран из компании» — П2c (тогда правило расширяется здесь и в homes()).
     */
    private function activeMember(Builder $query, string $company, string $user): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereExists(fn (Builder $q) => $q->from('company_members')
                ->where('company_members.kind', self::HOME)
                ->whereColumn('company_members.company_id', $company)
                ->whereColumn('company_members.user_id', $user)
                ->selectRaw('1'))
            ->orWhereExists(fn (Builder $q) => $q->from('users AS owners')
                ->whereColumn('owners.id', $user)
                ->where('owners.role', UserRole::Owner->value)
                ->selectRaw('1')));
    }

    /**
     * Членство «дом» — единственный вид членства в П2b-1 (CHECK). Условие «дом» — во всех выборках членства: здесь,
     * в activeMember() и во «Все сотрудники», и в связях Company::users / User::companies (привязка {user} в адресах).
     */
    private function homes(): Builder
    {
        return DB::table('company_members')->where('kind', self::HOME);
    }

    /**
     * @param  iterable<Permission>  $permissions
     * @return array<string, true>
     */
    private function permissionSet(iterable $permissions): array
    {
        $set = [];
        foreach ($permissions as $permission) {
            $set[$permission->value] = true;
        }

        return $set;
    }

    /**
     * Id пространств, открытых встроенной группе «Все сотрудники» (значок «доступно всем» в дереве).
     *
     * @return Collection<int, string>
     */
    public function spacesOpenToEveryone(): Collection
    {
        return DB::table('access_grants')
            ->join('groups', 'groups.id', '=', 'access_grants.group_id')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->where('groups.system_key', Group::EVERYONE)
            ->whereNotNull('nav_nodes.space_id')
            ->pluck('nav_nodes.space_id');
    }

    /**
     * Личные выдачи с правом «управление доступом» (администраторы пространств, ADR-0012) — у любых пользователей,
     * включая деактивированных: space_id → пользователи в порядке выдачи.
     *
     * @param  list<string>  $spaceIds
     * @return Collection<string, list<User>>
     */
    public function personalManagers(array $spaceIds): Collection
    {
        $grants = AccessGrant::query()
            ->joinSub($this->personalManagersQuery(), 'managers', 'managers.grant_id', '=', 'access_grants.id')
            ->whereIn('managers.space_id', $spaceIds)
            ->orderBy('access_grants.id')
            ->with('user')
            ->get(['access_grants.*', 'managers.space_id']);

        /** @var array<string, list<User>> $result */
        $result = [];
        foreach ($grants as $grant) {
            /** @var User $user */
            $user = $grant->user;
            $result[(string) $grant->getAttribute('space_id')][] = $user;
        }

        return collect($result);
    }

    /**
     * Подзапрос-флаг для строки spaces (админка, сортировка): есть ли в пространстве действующий личный
     * администратор — личная выдача с правом «управление доступом» не деактивированному пользователю (ADR-0012).
     */
    public function hasActivePersonalManagerColumn(): Builder
    {
        return DB::query()
            ->fromSub($this->personalManagersQuery(), 'managers')
            ->join('users', 'users.id', '=', 'managers.user_id')
            ->where('users.status', '!=', UserStatus::Deactivated->value)
            ->whereColumn('managers.space_id', 'spaces.id')
            ->selectRaw('count(*) > 0');
    }

    /** Останется ли в пространстве другой действующий личный администратор, кроме $user (инвариант ADR-0012). */
    public function hasAnotherActivePersonalManager(Space $space, User $user): bool
    {
        return DB::query()
            ->fromSub($this->personalManagersQuery(), 'managers')
            ->join('users', 'users.id', '=', 'managers.user_id')
            ->where('users.status', '!=', UserStatus::Deactivated->value)
            ->where('managers.space_id', $space->getKey())
            ->where('managers.user_id', '!=', $user->getKey())
            ->exists();
    }

    /**
     * Пространства компании, где пользователь — последний личный не деактивированный администратор
     * (после его деактивации там не останется действующего администратора).
     *
     * @return EloquentCollection<int, Space>
     */
    public function lastManagerSpaces(User $user, Company $company): EloquentCollection
    {
        $managers = $this->personalManagersQuery();

        return Space::query()
            ->inCompany($company)
            ->whereIn('id', DB::query()->fromSub($managers, 'mine')->where('mine.user_id', $user->getKey())->select('mine.space_id'))
            ->whereNotExists(fn (Builder $q) => $q
                ->fromSub($this->personalManagersQuery(), 'others')
                ->join('users', 'users.id', '=', 'others.user_id')
                ->where('users.status', '!=', UserStatus::Deactivated->value)
                ->where('others.user_id', '!=', $user->getKey())
                ->whereColumn('others.space_id', 'spaces.id')
                ->selectRaw('1'))
            ->orderBy('name')
            ->get();
    }

    /**
     * Сводка для админки компании «почему он видит / не видит»: все источники пользователя в пространствах этой
     * компании, включая недействующие, с причиной. Пространства — по названию. Человек — участник компании
     * (его ищет привязка маршрута среди людей компании).
     *
     * @return Collection<int, array{space: Space, access: SpaceAccess, sources: list<array{group: Group|null, source: AccessSource, inactive_reason: AccessInactiveReason|null}>}>
     */
    public function explain(User $user, Company $company): Collection
    {
        // «Все сотрудники» — только её «дома»: Владелец без «дома» в компании в неё не входит
        $home = $this->isHome($user, $company);

        $grants = AccessGrant::query()
            ->inCompany($company)
            ->where(fn ($q) => $q
                ->where('user_id', $user->getKey())
                ->orWhereIn('group_id', DB::table('group_members')->select('group_id')->where('user_id', $user->getKey()))
                ->when($home, fn ($q) => $q->orWhereIn('group_id', DB::table('groups')->select('id')->where('system_key', Group::EVERYONE))))
            ->whereHas('navNode', fn ($q) => $q->whereNotNull('space_id'))
            ->with(['group', 'navNode', 'role'])
            ->orderBy('id')
            ->get();
        $permissions = $this->rolePermissions($grants->pluck('role_id')->unique()->values()->all());
        $spaces = Space::query()
            ->whereIn('id', $grants->pluck('navNode.space_id')->unique())
            ->orderByRaw('lower(name)')
            ->get();

        return $spaces->map(function (Space $space) use ($grants, $permissions, $user) {
            $spaceGrants = $grants->filter(fn (AccessGrant $grant) => $grant->navNode->space_id === $space->id);
            $sources = [];

            foreach ($spaceGrants->whereNull('group_id') as $grant) {
                $sources[] = ['group' => null, 'source' => $this->source($grant, $permissions), 'inactive_reason' => null];
            }

            $groupGrants = $spaceGrants->whereNotNull('group_id')
                ->sortBy(fn (AccessGrant $grant) => mb_strtolower((string) $grant->group?->name));

            foreach ($groupGrants as $grant) {
                /** @var Group $group */
                $group = $grant->group;
                $sources[] = [
                    'group' => $group,
                    'source' => $this->source($grant, $permissions),
                    'inactive_reason' => $this->inactiveReason($group, $user),
                ];
            }

            $active = array_values(array_filter($sources, fn (array $s) => $s['inactive_reason'] === null));

            return [
                'space' => $space,
                'access' => new SpaceAccess(array_map(fn (array $s) => $s['source'], $active)),
                'sources' => $sources,
            ];
        })->values();
    }

    /**
     * Строки действующих источников: личные выдачи + выдачи активных групп активным участникам +
     * выдачи группе «Все сотрудники» компании её активным «домам». Только выдачи на узлы пространств и только
     * действующим участникам компании выдачи (activeMember — каждая ветка). Колонки: space_id, user_id, group_id
     * (null — личная), role_id.
     */
    private function sourceRows(?string $spaceId = null, ?string $userId = null, ?string $companyId = null): Builder
    {
        $grants = fn () => DB::table('access_grants')
            ->join('nav_nodes', fn ($join) => $join->on('nav_nodes.id', '=', 'access_grants.nav_node_id')
                ->whereNotNull('nav_nodes.space_id'))
            ->when($spaceId !== null, fn (Builder $q) => $q->where('nav_nodes.space_id', $spaceId))
            ->when($companyId !== null, fn (Builder $q) => $q->where('access_grants.company_id', $companyId));

        $personal = $this->activeMember($grants(), 'access_grants.company_id', 'access_grants.user_id')
            ->whereNotNull('access_grants.user_id')
            ->select(['nav_nodes.space_id', 'access_grants.user_id', DB::raw('NULL::char(26) AS group_id'), 'access_grants.role_id'])
            ->when($userId !== null, fn (Builder $q) => $q->where('access_grants.user_id', $userId));

        // Группа — той же компании, что выдача (составной FK); её участник — действующий участник этой компании
        $groups = $this->activeMember($grants(), 'access_grants.company_id', 'group_members.user_id')
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'access_grants.group_id')
                ->whereNull('groups.archived_at')
                ->whereNull('groups.system_key'))
            ->join('group_members', 'group_members.group_id', '=', 'access_grants.group_id')
            // Деактивированный остаётся в группе, но доступа через неё не получает
            ->join('users', fn ($join) => $join->on('users.id', '=', 'group_members.user_id')
                ->where('users.status', '!=', UserStatus::Deactivated->value))
            ->select(['nav_nodes.space_id', 'group_members.user_id', 'access_grants.group_id', 'access_grants.role_id'])
            ->when($userId !== null, fn (Builder $q) => $q->where('group_members.user_id', $userId));

        // Встроенная группа: состав не хранится — каждый активный «дом» компании выдачи
        $everyone = $grants()
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'access_grants.group_id')
                ->where('groups.system_key', Group::EVERYONE))
            ->join('company_members', fn ($join) => $join->on('company_members.company_id', '=', 'access_grants.company_id')
                ->where('company_members.kind', self::HOME))
            ->join('users', 'users.id', '=', 'company_members.user_id')
            ->where('users.status', UserStatus::Active->value)
            ->select(['nav_nodes.space_id', 'users.id AS user_id', 'access_grants.group_id', 'access_grants.role_id'])
            ->when($userId !== null, fn (Builder $q) => $q->where('users.id', $userId));

        return $personal->unionAll($groups)->unionAll($everyone);
    }

    /**
     * Источники вместе с ролью и её правами — тем же запросом.
     * Колонки: space_id, user_id, group_id, role_id, role_key, card_scope, permissions (JSON-массив).
     */
    private function withRoles(Builder $rows): Builder
    {
        return DB::query()
            ->fromSub($rows, 'src')
            ->join('roles', 'roles.id', '=', 'src.role_id')
            ->select(['src.space_id', 'src.user_id', 'src.group_id', 'src.role_id', 'roles.key AS role_key', 'roles.card_scope'])
            ->selectSub(
                DB::table('role_permissions')->selectRaw("coalesce(json_agg(permission), '[]')")->whereColumn('role_permissions.role_id', 'src.role_id'),
                'permissions',
            );
    }

    /**
     * Личные выдачи с правом «управление доступом» на узлы пространств — участникам компании выдачи (activeMember).
     * Колонки: grant_id, space_id, user_id.
     */
    private function personalManagersQuery(): Builder
    {
        return $this->activeMember(DB::table('access_grants'), 'access_grants.company_id', 'access_grants.user_id')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->join('role_permissions', fn ($join) => $join->on('role_permissions.role_id', '=', 'access_grants.role_id')
                ->where('role_permissions.permission', Permission::SpaceManageAccess->value))
            ->whereNotNull('access_grants.user_id')
            ->whereNotNull('nav_nodes.space_id')
            ->select(['access_grants.id AS grant_id', 'nav_nodes.space_id', 'access_grants.user_id']);
    }

    /** Есть ли право в роли (например, «управление доступом» у снимаемой выдачи — инвариант администратора). */
    public function rolePermits(string $roleId, Permission $permission): bool
    {
        return DB::table('role_permissions')->where('role_id', $roleId)->where('permission', $permission->value)->exists();
    }

    /**
     * Права ролей одним запросом: role_id → набор прав.
     *
     * @param  list<string>  $roleIds
     * @return array<string, array<string, true>>
     */
    private function rolePermissions(array $roleIds): array
    {
        $result = array_fill_keys($roleIds, []);

        foreach (DB::table('role_permissions')->whereIn('role_id', $roleIds)->get() as $row) {
            $result[$row->role_id][$row->permission] = true;
        }

        return $result;
    }

    /** @param  array<string, array<string, true>>  $permissions */
    private function source(AccessGrant $grant, array $permissions): AccessSource
    {
        return new AccessSource(
            $grant->role_id,
            $grant->role->key,
            $grant->role->card_scope,
            $permissions[$grant->role_id] ?? [],
            $grant->group_id,
        );
    }

    /**
     * Почему выдача группе не действует для пользователя (null — действует). Отдельный метод с объявленным типом:
     * разные версии phpstan выводят тип `match` внутри коллекции по-разному (точные случаи или общий тип), а шаблон
     * коллекции инвариантен — сводка `explain()` не сходилась бы с описанием на одной из них.
     */
    private function inactiveReason(Group $group, User $user): ?AccessInactiveReason
    {
        return match (true) {
            $group->isArchived() => AccessInactiveReason::GroupArchived,
            $user->status === UserStatus::Deactivated => AccessInactiveReason::UserDeactivated,
            // В «Все сотрудники» приглашённый входит после принятия приглашения
            $group->system_key === Group::EVERYONE && $user->status === UserStatus::Invited => AccessInactiveReason::UserInvited,
            default => null,
        };
    }

    /** @param  Collection<int, \stdClass>  $rows */
    private function toAccess(Collection $rows): SpaceAccess
    {
        return new SpaceAccess($rows
            // Личная выдача — первой (порядок важен только для показа)
            ->sortBy(fn (\stdClass $row) => $row->group_id === null ? '' : $row->group_id)
            ->map(fn (\stdClass $row) => new AccessSource(
                $row->role_id,
                $row->role_key === null ? null : StandardRole::from($row->role_key),
                CardScope::from($row->card_scope),
                array_fill_keys(json_decode($row->permissions, true), true),
                $row->group_id === null ? null : trim($row->group_id),
            ))
            ->values()
            ->all());
    }
}
