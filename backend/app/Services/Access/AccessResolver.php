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
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Единая точка прав (docs/adr/0024-rights-2.md, ADR-0012): единственное место, где для вычисления доступа читаются
 * членство в компаниях (company_members), выдачи (access_grants), права компании (company_permission_grants), состав
 * групп (group_members), роли и их права (roles, role_permissions). Политики, CardVisibility, списки пространств,
 * участники, подсказка @, админка компаний получают права только отсюда — напрямую или через Space::accessOf()
 * и Company::permissionsOf().
 *
 * Изоляция компаний — здесь же (одно правило, раздел 2 плана): выдача действует, только если её получатель —
 * действующий участник компании выдачи (activeMember()): её «дом», не убранный из компании; гость с неистёкшим сроком —
 * только для личных выдач на пространства; Владелец. Каждая ветка выборки источников соединяется с этим правилом по
 * компании выдачи; строка выдачи человеку без действующего членства ничего не даёт (гостю истёк срок, человека убрали из
 * компании) — срок проверяется на каждый запрос, без фоновых задач.
 *
 * Действующий источник — выдача на узел пространства: личная; группе — если она не в архиве, а пользователь
 * не деактивирован; встроенной группе «Все сотрудники» компании — каждому активному «дому» этой компании (её состав
 * не хранится, а вычисляется здесь: новый сотрудник получает доступ сразу после принятия приглашения,
 * деактивированный теряет его сразу). Права источника — права его роли; права ролей приходят тем же запросом,
 * что и выдачи.
 */
class AccessResolver
{
    /** Вид членства «дом» — полноправный сотрудник компании. */
    public const HOME = 'home';

    /**
     * Вид членства «гость» (П2c): сотрудник с «домом» в другой компании; только личные выдачи на пространства, роли без
     * «управления доступом», срок — по желанию; ни групп, ни «Все сотрудники», ни прав компании, ни админки.
     */
    public const GUEST = 'guest';

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
     * Люди с личной выдачей на пространство, у которых она не действует: убраны из компании или гостю истёк срок (П2c) —
     * вкладка «Люди» показывает их без доступа, как деактивированных.
     *
     * @return Collection<int, string>
     */
    public function inactivePersonalUserIds(Space $space): Collection
    {
        $active = $this->activeMember(DB::table('access_grants AS active'), 'active.company_id', 'active.user_id', guests: true)
            ->whereColumn('active.id', 'access_grants.id')
            ->selectRaw('1');

        return DB::table('access_grants')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->where('nav_nodes.space_id', $space->getKey())
            ->whereNotNull('access_grants.user_id')
            ->whereNotExists($active)
            ->pluck('access_grants.user_id');
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
     * компании; действующий «дом» — участник: администратор компании — с правами по умолчанию, плюс права, выданные ему
     * лично, через его группы компании и через «Все сотрудники» (П2c). Гость и убранный из компании — не участники
     * админки (её для них нет, 404).
     */
    public function forCompany(User $user, Company $company): CompanyAccess
    {
        return $this->companyAccesses($company, [$user])[$user->getKey()];
    }

    /**
     * Права в компании для списка людей одним запросом на вид (членство, число «домов», выданные права): запоминаются
     * в Company::permissionsOf().
     *
     * @param  iterable<User>  $users
     */
    public function rememberCompanyPermissions(Company $company, iterable $users): void
    {
        $users = collect($users);
        $accesses = $this->companyAccesses($company, $users);

        foreach ($users as $user) {
            $company->rememberPermissions($user, $accesses[$user->getKey()]);
        }
    }

    /**
     * @param  iterable<User>  $users
     * @return array<string, CompanyAccess> user_id → права в компании
     */
    private function companyAccesses(Company $company, iterable $users): array
    {
        $users = collect($users);
        $ids = $users->reject(fn (User $user) => $user->isOwner())->map(fn (User $user) => $user->getKey())->values()->all();
        $memberships = $ids === [] ? collect() : $this->memberships()
            ->where('company_id', $company->getKey())
            ->whereIn('user_id', $ids)
            ->get(['user_id', 'kind', 'is_admin', 'deactivated_at'])
            ->keyBy('user_id');
        $homes = $ids === [] ? collect() : $this->homes()->whereIn('user_id', $ids)->groupBy('user_id')
            ->selectRaw('user_id, count(*) AS homes')
            ->pluck('homes', 'user_id');
        $granted = $ids === [] ? [] : $this->grantedCompanyPermissions($company->getKey(), $ids);

        $result = [];
        foreach ($users as $user) {
            $result[$user->getKey()] = $user->isOwner()
                ? new CompanyAccess(member: true, admin: true, owner: true, permissions: $this->permissionSet(Permission::companyScope()), assignedAdmin: true)
                : $this->companyAccess($memberships->get($user->getKey()), (int) $homes->get($user->getKey(), 0), $granted[$user->getKey()] ?? []);
        }

        return $result;
    }

    /**
     * @param  \stdClass|null  $membership  строка членства в компании (null — не участник)
     * @param  int  $homes  во скольких компаниях он действующий «дом»
     * @param  list<string>  $granted  права компании, выданные лично и через группы
     */
    private function companyAccess(?\stdClass $membership, int $homes, array $granted): CompanyAccess
    {
        // Гость — не участник админки; убранный из компании — тоже, но его роль администратора видна (вернуть может
        // только Владелец)
        if ($membership === null || $membership->kind !== self::HOME) {
            return CompanyAccess::none();
        }
        if ($membership->deactivated_at !== null) {
            return new CompanyAccess(assignedAdmin: (bool) $membership->is_admin);
        }

        $isAdmin = (bool) $membership->is_admin;
        $permissions = $this->permissionSet($isAdmin ? Permission::companyAdminDefaults() : []) + array_fill_keys($granted, true);

        return new CompanyAccess(member: true, admin: $isAdmin, permissions: $permissions, otherHomes: $homes > 1, assignedAdmin: $isAdmin);
    }

    /**
     * Права компании, выданные людям (П2c): лично, через их группы компании (не в архиве; деактивированный в группе
     * их не получает) и через «Все сотрудники» (каждому активному «дому»). Только действующим «домам» компании: гость
     * и убранный из компании прав компании не получают, даже если строка выдачи осталась. user_id → права.
     *
     * @param  list<string>  $userIds
     * @return array<string, list<string>>
     */
    private function grantedCompanyPermissions(string $companyId, array $userIds): array
    {
        $grants = fn () => DB::table('company_permission_grants')->where('company_permission_grants.company_id', $companyId);
        // Действующий «дом» компании выдачи — в каждой ветке (как activeMember у выдач доступа)
        $home = fn ($join) => $join->where('company_members.company_id', $companyId)
            ->where('company_members.kind', self::HOME)
            ->whereNull('company_members.deactivated_at');

        $personal = $grants()
            ->join('company_members', fn ($join) => $home($join->on('company_members.user_id', '=', 'company_permission_grants.user_id')))
            ->whereIn('company_permission_grants.user_id', $userIds)
            ->select(['company_permission_grants.user_id', 'company_permission_grants.permission']);
        $groups = $grants()
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'company_permission_grants.group_id')
                ->whereNull('groups.archived_at')
                ->whereNull('groups.system_key'))
            ->join('group_members', 'group_members.group_id', '=', 'company_permission_grants.group_id')
            ->join('company_members', fn ($join) => $home($join->on('company_members.user_id', '=', 'group_members.user_id')))
            ->join('users', fn ($join) => $join->on('users.id', '=', 'group_members.user_id')
                ->where('users.status', '!=', UserStatus::Deactivated->value))
            ->whereIn('group_members.user_id', $userIds)
            ->select(['group_members.user_id', 'company_permission_grants.permission']);
        // «Все сотрудники»: состав не хранится — каждый активный «дом» компании
        $everyone = $grants()
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'company_permission_grants.group_id')
                ->where('groups.system_key', Group::EVERYONE))
            ->join('company_members', fn ($join) => $home($join->on('company_members.company_id', '=', 'company_permission_grants.company_id')))
            ->join('users', 'users.id', '=', 'company_members.user_id')
            ->where('users.status', UserStatus::Active->value)
            ->whereIn('users.id', $userIds)
            ->select(['users.id AS user_id', 'company_permission_grants.permission']);

        $result = [];
        foreach ($personal->union($groups)->union($everyone)->get() as $row) {
            $result[$row->user_id][] = $row->permission;
        }

        return $result;
    }

    /**
     * Откуда у человека права компании — для вкладки «Права компании» (П2c): выданные лично и через группы компании
     * (не в архиве; «Все сотрудники» — если он активный «дом»). permission → группы.
     *
     * @return array{personal: list<string>, groups: array<string, list<Group>>}
     */
    public function companyPermissionSources(User $user, Company $company): array
    {
        $personal = DB::table('company_permission_grants')
            ->where('company_id', $company->getKey())
            ->where('user_id', $user->getKey())
            ->pluck('permission')
            ->all();

        $groupIds = DB::table('group_members')->where('user_id', $user->getKey())->pluck('group_id');
        $grants = DB::table('company_permission_grants')
            ->join('groups', 'groups.id', '=', 'company_permission_grants.group_id')
            ->where('company_permission_grants.company_id', $company->getKey())
            ->whereNull('groups.archived_at')
            ->where(fn (Builder $q) => $q
                ->whereIn('groups.id', $groupIds)
                ->when($this->isHome($user, $company) && $user->status === UserStatus::Active, fn (Builder $q) => $q
                    ->orWhere('groups.system_key', Group::EVERYONE)))
            ->get(['company_permission_grants.permission', 'groups.id AS group_id']);
        $groups = Group::query()->whereIn('id', $grants->pluck('group_id')->unique())->get()->keyBy('id');

        $byPermission = [];
        foreach ($grants as $grant) {
            $byPermission[$grant->permission][] = $groups[$grant->group_id];
        }

        return ['personal' => $personal, 'groups' => $byPermission];
    }

    /**
     * Компании, где у пользователя есть права компании (Владелец — все): администратор компании или человек с выданными
     * правами (П2c), по дате создания — /auth/me (frontend — adminCompanies: адреса и меню админки).
     *
     * @return Collection<int, string>
     */
    public function adminCompanyIds(User $user): Collection
    {
        if ($user->isOwner()) {
            return DB::table('companies')->orderBy('created_at')->orderBy('id')->pluck('id');
        }

        $homes = $this->homes()->where('user_id', $user->getKey())->get(['company_id', 'is_admin']);
        $ids = $homes->filter(fn (\stdClass $home) => $home->is_admin
            || ($this->grantedCompanyPermissions($home->company_id, [$user->getKey()]) !== []))
            ->pluck('company_id');

        return DB::table('companies')->whereIn('id', $ids)->orderBy('created_at')->orderBy('id')->pluck('id');
    }

    /**
     * Для экрана Владельца «Компании»: сколько в каждой компании людей (действующие «дома» без деактивированных) и кто её
     * администраторы (по имени, с убранными из компании и деактивированными — у них пометка: member_deactivated_at).
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
            ->joinSub($this->memberships()->where('kind', self::HOME)->where('is_admin', true)
                ->select(['company_id', 'user_id', 'deactivated_at']), 'admins', 'admins.user_id', '=', 'users.id')
            ->orderBy('users.name')
            ->get(['users.*', 'admins.company_id AS admin_company_id', 'admins.deactivated_at AS member_deactivated_at'])
            ->groupBy(fn (User $user) => (string) $user->getAttribute('admin_company_id'));

        return ['people' => $people, 'admins' => $admins];
    }

    /**
     * Действующие администраторы компании: Владелец и активные администраторы компании, не убранные из неё (инвариант
     * «не оставить компанию без администратора», подсказки консоли).
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
     * (UserLock: права, проверенные политикой, не изменились параллельно): user_id → действующий администратор.
     *
     * @param  list<string>  $userIds
     * @return array<string, bool>
     */
    public function lockAdminFlags(Company $company, array $userIds): array
    {
        return $this->memberships()
            ->where('company_id', $company->getKey())
            ->whereIn('user_id', $userIds)
            ->orderBy('user_id')
            ->lockForUpdate()
            ->get(['user_id', 'kind', 'is_admin', 'deactivated_at'])
            ->mapWithKeys(fn (\stdClass $row) => [
                $row->user_id => $row->kind === self::HOME && $row->deactivated_at === null && (bool) $row->is_admin,
            ])
            ->all();
    }

    /**
     * Членство человека в компании (любое: «дом», в том числе убранный из компании, или гость, в том числе с истёкшим
     * сроком) — для Actions членства и показа; null — не участник. Права — только permissionsOf() и accessOf().
     */
    public function membership(Company|string $company, User $user, bool $lock = false): ?\stdClass
    {
        return $this->memberships()
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company)
            ->where('user_id', $user->getKey())
            ->when($lock, fn (Builder $q) => $q->lockForUpdate())
            ->first(['company_id', 'user_id', 'kind', 'is_admin', 'expires_at', 'deactivated_at']);
    }

    /**
     * Все членства компании (показ статуса человека в компании — CompanyMembers): user_id → строка.
     *
     * @return Collection<string, \stdClass>
     */
    public function membershipsOf(string $companyId): Collection
    {
        return $this->memberships()
            ->where('company_id', $companyId)
            ->get(['user_id', 'kind', 'is_admin', 'expires_at', 'deactivated_at'])
            ->keyBy('user_id');
    }

    /**
     * Сколько у человека действующих «домов» — под блокировкой его строк членства (замок входа: users.status — deactivated,
     * когда не осталось ни одного, П2c). Вызывать после блокировки строки пользователя (UserLock).
     */
    public function lockActiveHomesCount(User $user): int
    {
        return $this->memberships()
            ->where('user_id', $user->getKey())
            ->orderBy('company_id')
            ->lockForUpdate()
            ->get(['kind', 'deactivated_at'])
            ->filter(fn (\stdClass $row) => $row->kind === self::HOME && $row->deactivated_at === null)
            ->count();
    }

    /**
     * Подзапрос id людей компании — её действующих «домов» (состав групп, число людей в «Все сотрудники», события
     * «о человеке», права компании). «Пользователи» — companyPeopleIds, выбор людей для выдачи доступа —
     * assignablePeopleIds.
     */
    public function companyMemberIds(Company|string $company): Builder
    {
        return $this->homes()
            ->select('user_id')
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company);
    }

    /**
     * Подзапрос id людей компании для админки «Пользователи» и привязки {user} в её адресах: все её «дома» (и убранные
     * из компании — их можно вернуть), гости (и с истёкшим сроком — его можно продлить) и Владелец — он участник всех
     * компаний (ADR-0024).
     */
    public function companyPeopleIds(Company|string $company): Builder
    {
        return $this->memberships()
            ->select('user_id')
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company)
            ->union(DB::table('users')->select('id AS user_id')->where('role', UserRole::Owner->value));
    }

    /**
     * Подзапрос id людей компании в состоянии (фильтр «Пользователей», П2c) — статус в этой компании: active — активные
     * действующие «дома» и Владелец; invited — не принявшие приглашение; deactivated — убранные из компании и
     * отключённые Владельцем; guest — гости (и с истёкшим сроком).
     */
    public function companyPeopleIdsIn(Company $company, string $state): Builder
    {
        $users = fn (Builder $q, string $status) => $q->whereIn('user_id', DB::table('users')->select('id')->where('status', $status));
        $owner = DB::table('users')->select('id AS user_id')->where('role', UserRole::Owner->value);

        return match ($state) {
            'active' => $users($this->companyMemberIds($company), UserStatus::Active->value)->union($owner),
            'invited' => $users($this->companyMemberIds($company), UserStatus::Invited->value),
            'deactivated' => $this->memberships()->select('user_id')
                ->where('company_id', $company->getKey())
                ->where('kind', self::HOME)
                ->where(fn (Builder $q) => $q->whereNotNull('deactivated_at')
                    ->orWhereIn('user_id', DB::table('users')->select('id')->where('status', UserStatus::Deactivated->value))),
            'guest' => $this->memberships()->select('user_id')->where('company_id', $company->getKey())->where('kind', self::GUEST),
            default => throw new \InvalidArgumentException("Unknown state {$state}"),
        };
    }

    /**
     * Подзапрос id людей, которым в компании можно выдать доступ из пространства и группы: действующие «дома» и
     * Владелец. Гостей добавляют только из админки компании («Добавить гостя», решение PM 28.10).
     */
    public function assignablePeopleIds(Company|string $company): Builder
    {
        return $this->companyMemberIds($company)
            ->union(DB::table('users')->select('id AS user_id')->where('role', UserRole::Owner->value));
    }

    /**
     * Действующий участник компании: Владелец, действующий «дом» или гость с неистёкшим сроком (кому выдача в ней
     * будет действовать).
     */
    public function isActiveParticipant(Company|string $company, User $user): bool
    {
        return $user->isOwner() || $this->activeMemberships(guests: true)
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company)
            ->where('user_id', $user->getKey())
            ->exists();
    }

    /** Гость компании (любой: и с истёкшим сроком). */
    public function isGuest(Company|string $company, User $user): bool
    {
        return $this->memberships()
            ->where('company_id', $company instanceof Company ? $company->getKey() : $company)
            ->where('user_id', $user->getKey())
            ->where('kind', self::GUEST)
            ->exists();
    }

    /** Пользователь — действующий «дом» компании (Владелец — участник всех компаний, но «дом» — только где он сотрудник). */
    public function isHome(User $user, Company $company): bool
    {
        return $this->homes()->where('company_id', $company->getKey())->where('user_id', $user->getKey())->exists();
    }

    /**
     * Подзапрос id компаний, где пользователь — действующий «дом» или гость с неистёкшим сроком (дерево: какие компании
     * ему показывать).
     */
    public function memberCompanyIds(User $user): Builder
    {
        return $this->activeMemberships(guests: true)->select('company_id')->where('user_id', $user->getKey());
    }

    /**
     * Действующее членство (одно правило изоляции компаний): пользователь из колонки $user — действующий «дом» компании
     * из колонки $company (не убран из неё), гость с неистёкшим сроком (если $guests — только личные выдачи на
     * пространства) или Владелец (он участник всех компаний — чтобы ему можно было выдать доступ, ADR-0024).
     */
    private function activeMember(Builder $query, string $company, string $user, bool $guests = false): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereExists(fn (Builder $q) => $this->activeMemberships($guests, $q->from('company_members'))
                ->whereColumn('company_members.company_id', $company)
                ->whereColumn('company_members.user_id', $user)
                ->selectRaw('1'))
            ->orWhereExists(fn (Builder $q) => $q->from('users AS owners')
                ->whereColumn('owners.id', $user)
                ->where('owners.role', UserRole::Owner->value)
                ->selectRaw('1')));
    }

    /**
     * Строки действующего членства: «дом», не убранный из компании; с $guests — ещё гость, у которого срок не задан или
     * не истёк. Время — PHP (Date::now()), а не SQL now(): так срок проверяется на каждый запрос одинаково везде,
     * в том числе в тестах со сдвигом времени.
     */
    private function activeMemberships(bool $guests, ?Builder $query = null): Builder
    {
        return ($query ?? DB::table('company_members'))
            ->whereNull('company_members.deactivated_at')
            ->where(fn (Builder $q) => $q
                ->where('company_members.kind', self::HOME)
                ->when($guests, fn (Builder $q) => $q->orWhere(fn (Builder $q) => $q
                    ->where('company_members.kind', self::GUEST)
                    ->where(fn (Builder $q) => $q
                        ->whereNull('company_members.expires_at')
                        ->orWhere('company_members.expires_at', '>', Date::now())))));
    }

    /**
     * Действующие «дома» — условие во всех выборках «людей компании»: состав групп, «Все сотрудники», права компании,
     * администраторы. Все строки членства (и убранные, и гости) — memberships().
     */
    private function homes(): Builder
    {
        return $this->activeMemberships(guests: false);
    }

    private function memberships(): Builder
    {
        return DB::table('company_members');
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
            ->fromSub($this->personalManagersQuery(active: true), 'managers')
            ->whereColumn('managers.space_id', 'spaces.id')
            ->selectRaw('count(*) > 0');
    }

    /** Останется ли в пространстве другой действующий личный администратор, кроме $user (инвариант ADR-0012). */
    public function hasAnotherActivePersonalManager(Space $space, User $user): bool
    {
        return DB::query()
            ->fromSub($this->personalManagersQuery(active: true), 'managers')
            ->where('managers.space_id', $space->getKey())
            ->where('managers.user_id', '!=', $user->getKey())
            ->exists();
    }

    /**
     * Пространства компании (без компании — всех его компаний: отключение учётной записи, передача владения), где
     * пользователь — последний действующий личный администратор (после его деактивации там не останется действующего
     * администратора).
     *
     * @return EloquentCollection<int, Space>
     */
    public function lastManagerSpaces(User $user, ?Company $company = null): EloquentCollection
    {
        $managers = $this->personalManagersQuery();

        return Space::query()
            ->when($company !== null, fn (EloquentBuilder $q) => $q->inCompany($company))
            ->whereIn('id', DB::query()->fromSub($managers, 'mine')->where('mine.user_id', $user->getKey())->select('mine.space_id'))
            ->whereNotExists(fn (Builder $q) => $q
                ->fromSub($this->personalManagersQuery(active: true), 'others')
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
        // «Все сотрудники» — только её «дома» (и убранные из компании — источник с причиной): Владелец без «дома» в ней
        // не входит
        $membership = $this->membership($company, $user);
        $home = $membership?->kind === self::HOME;
        $memberReason = $user->isOwner() ? null : $this->membershipReason($membership);

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

        return $spaces->map(function (Space $space) use ($grants, $permissions, $user, $memberReason) {
            $spaceGrants = $grants->filter(fn (AccessGrant $grant) => $grant->navNode->space_id === $space->id);
            $sources = [];

            foreach ($spaceGrants->whereNull('group_id') as $grant) {
                $sources[] = ['group' => null, 'source' => $this->source($grant, $permissions), 'inactive_reason' => $memberReason];
            }

            $groupGrants = $spaceGrants->whereNotNull('group_id')
                ->sortBy(fn (AccessGrant $grant) => mb_strtolower((string) $grant->group?->name));

            foreach ($groupGrants as $grant) {
                /** @var Group $group */
                $group = $grant->group;
                $sources[] = [
                    'group' => $group,
                    'source' => $this->source($grant, $permissions),
                    'inactive_reason' => $memberReason ?? $this->inactiveReason($group, $user),
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

        // Личная выдача — и гостю с неистёкшим сроком (гостю — только на пространства: выдачи на папки — П2d, без гостей)
        $personal = $this->activeMember($grants(), 'access_grants.company_id', 'access_grants.user_id', guests: true)
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
                ->where('company_members.kind', self::HOME)
                ->whereNull('company_members.deactivated_at'))
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
     * Личные выдачи с правом «управление доступом» на узлы пространств. Колонки: grant_id, space_id, user_id.
     * Для показа — участникам компании выдачи: её «домам» (и убранным из неё — с пометкой) и Владельцу; $active —
     * только действующим (activeMember) и не деактивированным: инвариант «личный администратор» (ADR-0012).
     */
    private function personalManagersQuery(bool $active = false): Builder
    {
        $grants = DB::table('access_grants')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->join('role_permissions', fn ($join) => $join->on('role_permissions.role_id', '=', 'access_grants.role_id')
                ->where('role_permissions.permission', Permission::SpaceManageAccess->value))
            ->whereNotNull('access_grants.user_id')
            ->whereNotNull('nav_nodes.space_id')
            ->select(['access_grants.id AS grant_id', 'nav_nodes.space_id', 'access_grants.user_id']);

        if ($active) {
            return $this->activeMember($grants, 'access_grants.company_id', 'access_grants.user_id')
                ->join('users', fn ($join) => $join->on('users.id', '=', 'access_grants.user_id')
                    ->where('users.status', '!=', UserStatus::Deactivated->value));
        }

        return $grants->where(fn (Builder $q) => $q
            ->whereExists(fn (Builder $q) => $q->from('company_members')
                ->where('company_members.kind', self::HOME)
                ->whereColumn('company_members.company_id', 'access_grants.company_id')
                ->whereColumn('company_members.user_id', 'access_grants.user_id')
                ->selectRaw('1'))
            ->orWhereExists(fn (Builder $q) => $q->from('users AS owners')
                ->whereColumn('owners.id', 'access_grants.user_id')
                ->where('owners.role', UserRole::Owner->value)
                ->selectRaw('1')));
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
     * Почему не действует членство в компании (null — действует): убран из компании или у гостя истёк срок. Тогда не
     * действуют все его источники в ней — и личные (П2c).
     */
    private function membershipReason(?\stdClass $membership): ?AccessInactiveReason
    {
        return match (true) {
            $membership === null, $membership->deactivated_at !== null => AccessInactiveReason::UserDeactivated,
            $membership->kind === self::GUEST && $membership->expires_at !== null
                && Date::parse($membership->expires_at)->lte(Date::now()) => AccessInactiveReason::GuestExpired,
            default => null,
        };
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
