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
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use Illuminate\Contracts\Database\Query\Expression;
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
 * Действующий источник — выдача на узел дерева или на любую папку над ним (П2d-1: выдача на папку действует на всё
 * внутри, включая созданное позже; предки — рекурсивный CTE по nav_nodes в том же запросе): личная; группе — если она
 * не в архиве, а пользователь не деактивирован; встроенной группе «Все сотрудники» компании — каждому активному «дому»
 * этой компании (её состав не хранится, а вычисляется здесь: новый сотрудник получает доступ сразу после принятия
 * приглашения, деактивированный теряет его сразу). Гостю — только личные выдачи на само пространство, без
 * наследования. Каждая строка выдачи — отдельный источник (несколько ролей у субъекта на узле — несколько источников).
 * Права источника — права его роли; права ролей приходят тем же запросом, что и выдачи.
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

    /** Права пользователя на узле дерева (папке или пространстве) — один запрос. Кеширует NavNode::accessOf(). */
    public function forNode(User $user, NavNode $node): SpaceAccess
    {
        return $this->toAccess($this->withRoles($this->sourceRows(userId: $user->getKey(), nodeId: $node->getKey(), spacesOnly: false))->get());
    }

    /**
     * Права пользователя на всех узлах дерева одним запросом (дерево навигации: папка видна, если на неё есть право):
     * node_id → права. Узла без доступа в ответе нет.
     *
     * @return Collection<string, SpaceAccess>
     */
    public function forUserNodes(User $user): Collection
    {
        return $this->withRoles($this->sourceRows(userId: $user->getKey(), spacesOnly: false))->get()
            ->groupBy(fn (\stdClass $row) => trim($row->node_id))
            ->map(fn (Collection $rows) => $this->toAccess($rows));
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

        // Только участники компании (строка членства есть): человек без членства в ней — не её, его там не показываем
        return DB::table('access_grants')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->join('company_members', fn ($join) => $join->on('company_members.company_id', '=', 'access_grants.company_id')
                ->on('company_members.user_id', '=', 'access_grants.user_id'))
            ->where('nav_nodes.space_id', $space->getKey())
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
     * Управляет доступом хотя бы к одному пространству или папке компании (лично, через группу, через папку выше) —
     * справочник сотрудников и групп этой компании для выдачи доступа.
     */
    public function managesAccessIn(User $user, Company $company): bool
    {
        return DB::query()
            ->fromSub($this->sourceRows(userId: $user->getKey(), companyId: $company->getKey(), spacesOnly: false), 'access')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'access.role_id')
            ->whereIn('role_permissions.permission', [Permission::SpaceManageAccess->value, Permission::FolderManageAccess->value])
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
     * Что даёт группа (П2c): есть ли у неё выдачи доступа и права компании. Состав такой группы — это выдача доступа
     * и прав компании, поэтому его меняет только тот, кто их выдаёт (GroupPolicy::manageMembers).
     *
     * @return array{access: bool, company_permissions: bool, owner_permissions: bool}
     */
    public function groupGrants(Group $group): array
    {
        $permissions = DB::table('company_permission_grants')->where('group_id', $group->getKey())->pluck('permission');
        $ownerGranted = array_map(fn (Permission $p) => $p->value, Permission::ownerGranted());

        return [
            'access' => DB::table('access_grants')->where('group_id', $group->getKey())->exists(),
            'company_permissions' => $permissions->isNotEmpty(),
            'owner_permissions' => $permissions->intersect($ownerGranted)->isNotEmpty(),
        ];
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
     * События «о человеке» (без компании: вход, смена пароля, отключение учётной записи), которые видит журнал компании
     * (условие на event_log): о её действующих «домах» — с их прихода в неё (о первом «доме» человека — все); об убранных из неё, которые больше нигде не работают
     * (учётная запись деактивирована), — до того, как их убрали, и после того, как они перестали работать везде (попытки
     * входа уволенного). Убранный, но работающий в другой компании, — ничего: его входы выдали бы, что он работает где-то
     * ещё (ревью П2c-1).
     *
     * @param  EloquentBuilder<EventLogEntry>  $query
     * @return EloquentBuilder<EventLogEntry>
     */
    public function eventsAboutPeople(EloquentBuilder $query, Company $company): EloquentBuilder
    {
        return $query->where(fn (EloquentBuilder $q) => $q
            // Действующий «дом» — с того, как он пришёл в компанию (аудит П2c-1, S-3: его входы, пока он работал только
            // в другой, ей не показываем); первый «дом» человека — вся история
            ->whereExists(fn (Builder $q) => $this->activeMemberships(guests: false, query: $q->from('company_members'))
                ->whereColumn('company_members.user_id', 'event_log.subject_id')
                ->where('company_members.company_id', $company->getKey())
                ->where(fn (Builder $q) => $q
                    ->whereColumn('event_log.occurred_at', '>=', 'company_members.created_at')
                    ->orWhereNotExists(fn (Builder $q) => $q->from('company_members AS earlier')
                        ->whereColumn('earlier.user_id', 'company_members.user_id')
                        ->where('earlier.kind', self::HOME)
                        ->whereColumn('earlier.created_at', '<', 'company_members.created_at')
                        ->selectRaw('1')))
                ->selectRaw('1'))
            ->orWhereExists(fn (Builder $q) => $q->from('company_members')
                ->join('users', 'users.id', '=', 'company_members.user_id')
                ->whereColumn('company_members.user_id', 'event_log.subject_id')
                ->where('company_members.company_id', $company->getKey())
                ->where('company_members.kind', self::HOME)
                ->whereNotNull('company_members.deactivated_at')
                ->where('users.status', UserStatus::Deactivated->value)
                // До ухода из этой компании и после того, как он перестал работать везде; между — он работал в другой
                ->where(fn (Builder $q) => $q
                    ->whereColumn('event_log.occurred_at', '<=', 'company_members.deactivated_at')
                    ->orWhereColumn('event_log.occurred_at', '>=', 'users.deactivated_at'))
                ->selectRaw('1')));
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

    /** Подзапрос id компаний, где у пользователя есть любое членство («дом», в том числе убранный, или гость). */
    public function membershipCompanyIds(User $user): Builder
    {
        return $this->memberships()->select('company_id')->where('user_id', $user->getKey());
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
     * Id пространств, открытых встроенной группе «Все сотрудники» (значок «доступно всем» в дереве) — выдачей на само
     * пространство или на папку над ним.
     *
     * @return Collection<int, string>
     */
    public function spacesOpenToEveryone(): Collection
    {
        // Выдача «Все сотрудники» на пространство или на папку над ним (П2d-1)
        return $this->paths(spacesOnly: true)
            ->join('access_grants', 'access_grants.nav_node_id', '=', 'paths.ancestor_id')
            ->join('groups', 'groups.id', '=', 'access_grants.group_id')
            ->where('groups.system_key', Group::EVERYONE)
            ->distinct()
            ->pluck('paths.space_id');
    }

    /**
     * Личные выдачи с правом «управление доступом» на пространство или папку над ним (администраторы пространств,
     * ADR-0012) — у любых пользователей, включая деактивированных: space_id → пользователи в порядке выдачи.
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

        /** @var array<string, array<string, User>> $result */
        $result = [];
        foreach ($grants as $grant) {
            /** @var User $user */
            $user = $grant->user;
            // Управляющий и на пространстве, и на папке над ним — один раз
            $result[(string) $grant->getAttribute('space_id')][$user->id] ??= $user;
        }

        return collect($result)->map(fn (array $users) => array_values($users));
    }

    /**
     * Подзапрос id пространств, где есть действующий личный управляющий — личная выдача с правом «управление доступом»
     * на пространство или папку над ним не деактивированному действующему участнику (ADR-0012; админка, сортировка):
     * считается один раз, а не на каждую строку списка.
     */
    public function managedSpaceIds(): Builder
    {
        return DB::query()->fromSub($this->personalManagersQuery(active: true), 'managers')->select('managers.space_id');
    }

    /**
     * Активные пространства поддерева узла (сам узел, если это пространство, и всё внутри папки) без действующего личного
     * управляющего — инвариант «есть кто управляет доступом» (AccessManagerGuard, П2d-1).
     *
     * @return list<string>
     */
    public function unmanagedSpaceIds(NavNode $node): array
    {
        return Space::query()
            ->whereIn('id', $this->subtreeSpaceIds($node))
            ->whereNull('archived_at')
            ->whereNotIn('id', $this->managedSpaceIds())
            ->orderBy('id')
            ->pluck('id')
            ->all();
    }

    /**
     * Какие роли у кого в поддереве узла по выдачам (на узлы поддерева и на папки над ним) — «Переместить в…»
     * сравнивает до и после (MoveImpact): «user:<id>» / «group:<id>» → узел поддерева → id ролей (по возрастанию). Без
     * проверки членства: выдачи архивной группе и убранному из компании тоже считаются — они оживут при возвращении
     * (решение PM 29.10); итоговый список людей фильтрует вызывающий.
     *
     * @return array<string, array<string, list<string>>>
     */
    public function subtreeSubjects(NavNode $node): array
    {
        $rows = $this->paths()
            ->join('access_grants', 'access_grants.nav_node_id', '=', 'paths.ancestor_id')
            ->whereIn('paths.node_id', $this->subtreeNodeIds($node))
            ->distinct()
            ->get(['paths.node_id', 'access_grants.user_id', 'access_grants.group_id', 'access_grants.role_id']);

        $result = [];
        foreach ($rows as $row) {
            $key = $row->user_id !== null ? 'user:'.trim($row->user_id) : 'group:'.trim($row->group_id);
            $result[$key][trim($row->node_id)][] = trim($row->role_id);
        }

        // Набор ролей — без порядка: сравнивается как список
        return array_map(fn (array $nodes) => array_map(function (array $roles) {
            sort($roles);

            return $roles;
        }, $nodes), $result);
    }

    /** Подзапрос id узлов поддерева (сам узел и всё внутри него). */
    private function subtreeNodeIds(NavNode $node): Builder
    {
        return DB::query()->fromRaw(<<<'SQL'
            (WITH RECURSIVE down AS (
                SELECT id, space_id, 0 AS depth FROM nav_nodes WHERE id = ?
                UNION ALL
                SELECT n.id, n.space_id, down.depth + 1 FROM nav_nodes n JOIN down ON n.parent_id = down.id
                 WHERE down.depth < ?
            ) SELECT id, space_id FROM down) AS subtree
            SQL, [$node->getKey(), NavNode::RECURSION_LIMIT])->select('subtree.id');
    }

    /** Подзапрос id пространств поддерева узла. */
    private function subtreeSpaceIds(NavNode $node): Builder
    {
        return $this->subtreeNodeIds($node)->select('subtree.space_id')->whereNotNull('subtree.space_id');
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
     * компании, включая недействующие, с причиной; унаследованные с папок выше — с папкой (П2d-1). Пространства — по
     * названию. Человек — участник компании (его ищет привязка маршрута среди людей компании).
     *
     * @return Collection<int, array{space: Space, access: SpaceAccess, sources: list<array{group: Group|null, folder: NavNode|null, source: AccessSource, inactive_reason: AccessInactiveReason|null}>}>
     */
    public function explain(User $user, Company $company): Collection
    {
        // «Все сотрудники» — только её «дома» (и убранные из компании — источник с причиной): Владелец без «дома» в ней
        // не входит
        $membership = $this->membership($company, $user);
        $home = $membership?->kind === self::HOME;
        $guest = $membership?->kind === self::GUEST;
        $memberReason = $user->isOwner() ? null : $this->membershipReason($membership);

        $grants = AccessGrant::query()
            ->inCompany($company)
            ->where(fn ($q) => $q
                ->where('user_id', $user->getKey())
                ->orWhereIn('group_id', DB::table('group_members')->select('group_id')->where('user_id', $user->getKey()))
                ->when($home, fn ($q) => $q->orWhereIn('group_id', DB::table('groups')->select('id')->where('system_key', Group::EVERYONE))))
            ->with(['group', 'navNode', 'role'])
            ->orderBy('id')
            ->get()
            ->groupBy('nav_node_id');
        $permissions = $this->rolePermissions($grants->flatten()->pluck('role_id')->unique()->values()->all());

        // Выдача на папку действует на всё внутри: путь каждого пространства компании к корню — по дереву компании
        $nodes = NavNode::query()->inCompany($company)->get(['id', 'parent_id', 'space_id']);
        $parents = $nodes->pluck('parent_id', 'id');
        $paths = [];
        foreach ($nodes->whereNotNull('space_id') as $node) {
            // Каждый узел пути — один раз: цикл в данных не зациклит обход (аудит П2d-1, S-2)
            for ($id = $node->id, $seen = []; $id !== null && ! isset($seen[$id]); $id = $parents[$id] ?? null) {
                $seen[$id] = true;
                if ($grants->has($id)) {
                    $paths[$node->space_id][] = $id;
                }
            }
        }
        $spaces = Space::query()->whereIn('id', array_keys($paths))->orderByRaw('lower(name)')->get();

        return $spaces->map(function (Space $space) use ($grants, $paths, $permissions, $user, $memberReason, $guest) {
            $sources = [];
            // Сначала выдачи на само пространство, затем — с ближней папки к дальней; на каждом узле — личные, затем группы
            foreach ($paths[$space->id] as $nodeId) {
                /** @var EloquentCollection<int, AccessGrant> $nodeGrants */
                $nodeGrants = $grants[$nodeId];
                $folder = $nodeGrants->first()?->navNode;
                $folder = $folder?->isFolder() ? $folder : null;

                foreach ($nodeGrants->whereNull('group_id') as $grant) {
                    // Гостю — только выдача на само пространство (выдачи гостю на папки запрещены, П2c)
                    $reason = $memberReason ?? ($guest && $folder !== null ? AccessInactiveReason::UserDeactivated : null);
                    $sources[] = ['group' => null, 'folder' => $folder, 'source' => $this->source($grant, $permissions), 'inactive_reason' => $reason];
                }

                $groupGrants = $nodeGrants->whereNotNull('group_id')
                    ->sortBy(fn (AccessGrant $grant) => mb_strtolower((string) $grant->group?->name));

                foreach ($groupGrants as $grant) {
                    /** @var Group $group */
                    $group = $grant->group;
                    $sources[] = [
                        'group' => $group,
                        'folder' => $folder,
                        'source' => $this->source($grant, $permissions),
                        'inactive_reason' => $memberReason ?? $this->inactiveReason($group, $user),
                    ];
                }
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
     * Узлы дерева с путём к корню (П2d-1): строка на каждую пару «узел — он сам или папка над ним». Колонки: node_id,
     * space_id (у узла пространства), ancestor_id. Отбор — по узлу, пространству или только узлы пространств; рекурсия
     * идёт вверх по первичному ключу. Глубину дерева держат перемещение и создание папок (NavNode::MAX_FOLDER_DEPTH),
     * число шагов рекурсии — ещё и здесь (NavNode::RECURSION_LIMIT: цикл в данных не зациклит запрос).
     */
    private function paths(?string $nodeId = null, ?string $spaceId = null, bool $spacesOnly = false): Builder
    {
        $where = [];
        $bindings = [];
        if ($nodeId !== null) {
            $where[] = 'n.id = ?';
            $bindings[] = $nodeId;
        }
        if ($spaceId !== null) {
            $where[] = 'n.space_id = ?';
            $bindings[] = $spaceId;
        }
        if ($spacesOnly) {
            $where[] = 'n.space_id IS NOT NULL';
        }
        $filter = $where === [] ? '' : 'WHERE '.implode(' AND ', $where);

        $bindings[] = NavNode::RECURSION_LIMIT;

        return DB::query()->fromRaw(<<<SQL
            (WITH RECURSIVE up AS (
                SELECT n.id AS node_id, n.space_id, n.id AS ancestor_id, n.parent_id, 0 AS depth FROM nav_nodes n {$filter}
                UNION ALL
                SELECT up.node_id, up.space_id, a.id, a.parent_id, up.depth + 1 FROM up JOIN nav_nodes a ON a.id = up.parent_id
                 WHERE up.depth < ?
            ) SELECT node_id, space_id, ancestor_id FROM up) AS paths
            SQL, $bindings);
    }

    /**
     * Строки действующих источников: выдачи на узел и на папки над ним — личные + выдачи активных групп активным
     * участникам + выдачи группе «Все сотрудники» компании её активным «домам». Только действующим участникам
     * компании выдачи (activeMember — каждая ветка); гостю — только личная выдача на само пространство. Колонки: node_id,
     * space_id (у узла пространства), user_id, group_id (null — личная), role_id, grant_node_id (узел выдачи: сам узел
     * или папка, с которой доступ унаследован).
     */
    private function sourceRows(?string $spaceId = null, ?string $userId = null, ?string $companyId = null, ?string $nodeId = null, bool $spacesOnly = true): Builder
    {
        $grants = fn () => $this->paths($nodeId, $spaceId, $spacesOnly && $nodeId === null)
            ->join('access_grants', 'access_grants.nav_node_id', '=', 'paths.ancestor_id')
            ->when($companyId !== null, fn (Builder $q) => $q->where('access_grants.company_id', $companyId));
        $columns = fn (string $user, string|Expression $group) => [
            'paths.node_id', 'paths.space_id', $user, $group, 'access_grants.role_id', 'access_grants.nav_node_id AS grant_node_id',
        ];

        // Личная выдача: «дому» и Владельцу — на узел и на папки над ним; гостю с неистёкшим сроком — только на само
        // пространство (выдачи гостю на папки запрещены и в БД, П2c)
        $personal = $grants()
            ->whereNotNull('access_grants.user_id')
            ->where(fn (Builder $q) => $this->activeMember($q, 'access_grants.company_id', 'access_grants.user_id')
                ->orWhere(fn (Builder $q) => $this->activeMember($q, 'access_grants.company_id', 'access_grants.user_id', guests: true)
                    ->whereColumn('access_grants.nav_node_id', 'paths.node_id')
                    ->whereNotNull('paths.space_id')))
            ->select($columns('access_grants.user_id', DB::raw('NULL::char(26) AS group_id')))
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
            ->select($columns('group_members.user_id', 'access_grants.group_id'))
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
            ->select($columns('users.id AS user_id', 'access_grants.group_id'))
            ->when($userId !== null, fn (Builder $q) => $q->where('users.id', $userId));

        return $personal->unionAll($groups)->unionAll($everyone);
    }

    /**
     * Источники вместе с ролью и её правами — тем же запросом.
     * Колонки: node_id, space_id, user_id, group_id, role_id, grant_node_id, role_key, card_scope, permissions (JSON-массив).
     */
    private function withRoles(Builder $rows): Builder
    {
        return DB::query()
            ->fromSub($rows, 'src')
            ->join('roles', 'roles.id', '=', 'src.role_id')
            ->select(['src.node_id', 'src.space_id', 'src.user_id', 'src.group_id', 'src.role_id', 'src.grant_node_id', 'roles.key AS role_key', 'roles.card_scope'])
            ->selectSub(
                DB::table('role_permissions')->selectRaw("coalesce(json_agg(permission), '[]')")->whereColumn('role_permissions.role_id', 'src.role_id'),
                'permissions',
            );
    }

    /**
     * Личные выдачи с правом «управление доступом» на пространства и на папки над ними. Колонки: grant_id, space_id,
     * user_id (у выдачи на папку — строка на каждое пространство внутри).
     * Для показа — участникам компании выдачи: её «домам» (и убранным из неё — с пометкой) и Владельцу; $active —
     * только действующим (activeMember) и не деактивированным: инвариант «личный администратор» (ADR-0012).
     */
    private function personalManagersQuery(bool $active = false): Builder
    {
        // Выдача на пространство или на папку над ним (П2d-1): управляющий папки управляет доступом ко всему внутри
        $grants = $this->paths(spacesOnly: true)
            ->join('access_grants', 'access_grants.nav_node_id', '=', 'paths.ancestor_id')
            ->join('role_permissions', fn ($join) => $join->on('role_permissions.role_id', '=', 'access_grants.role_id')
                ->where('role_permissions.permission', Permission::SpaceManageAccess->value))
            ->whereNotNull('access_grants.user_id')
            ->select(['access_grants.id AS grant_id', 'paths.space_id', 'access_grants.user_id']);

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
            $grant->navNode->isFolder() ? $grant->nav_node_id : null,
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
            // Личные выдачи — первыми, на сам узел — раньше унаследованных (порядок важен только для показа)
            ->sortBy(fn (\stdClass $row) => [$row->group_id === null ? '' : $row->group_id, $row->grant_node_id === $row->node_id ? 0 : 1, $row->role_id])
            ->map(fn (\stdClass $row) => new AccessSource(
                $row->role_id,
                $row->role_key === null ? null : StandardRole::from($row->role_key),
                CardScope::from($row->card_scope),
                array_fill_keys(json_decode($row->permissions, true), true),
                $row->group_id === null ? null : trim($row->group_id),
                trim($row->grant_node_id) === trim($row->node_id) ? null : trim($row->grant_node_id),
            ))
            ->values()
            ->all());
    }
}
