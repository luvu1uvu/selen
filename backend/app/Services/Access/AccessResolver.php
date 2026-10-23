<?php

namespace App\Services\Access;

use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\StandardRole;
use App\Enums\UserStatus;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Единая точка прав (docs/adr/0024-rights-2.md, ADR-0012): единственное место, где для вычисления доступа читаются
 * выдачи (access_grants), состав групп (group_members), роли и их права (roles, role_permissions). Политики,
 * CardVisibility, списки пространств, участники, подсказка @ получают права только отсюда — напрямую или через
 * Space::accessOf().
 *
 * Действующий источник — выдача на узел пространства: личная; группе — если она не в архиве, а пользователь
 * не деактивирован; встроенной группе «Все сотрудники» — каждому активному пользователю (её состав не хранится,
 * а вычисляется здесь: новый сотрудник получает доступ сразу после принятия приглашения, деактивированный теряет
 * его сразу). Права источника — права его роли; права ролей приходят тем же запросом, что и выдачи.
 */
class AccessResolver
{
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

    /** Управляет доступом хотя бы к одному пространству (лично или через группу) — справочник сотрудников и групп. */
    public function managesAccessAnywhere(User $user): bool
    {
        return DB::query()
            ->fromSub($this->sourceRows(userId: $user->getKey()), 'access')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'access.role_id')
            ->where('role_permissions.permission', Permission::SpaceManageAccess->value)
            ->exists();
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
     * Пространства, где пользователь — последний личный не деактивированный администратор
     * (после его деактивации там не останется действующего администратора).
     *
     * @return EloquentCollection<int, Space>
     */
    public function lastManagerSpaces(User $user): EloquentCollection
    {
        $managers = $this->personalManagersQuery();

        return Space::query()
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
     * Сводка для админки «почему он видит / не видит»: все источники пользователя, включая недействующие,
     * с причиной. Пространства — по названию.
     *
     * @return Collection<int, array{space: Space, access: SpaceAccess, sources: list<array{group: Group|null, source: AccessSource, inactive_reason: 'group_archived'|'user_deactivated'|'user_invited'|null}>}>
     */
    public function explain(User $user): Collection
    {
        $deactivated = $user->status === UserStatus::Deactivated;

        $grants = AccessGrant::query()
            ->where(fn ($q) => $q
                ->where('user_id', $user->getKey())
                ->orWhereIn('group_id', DB::table('group_members')->select('group_id')->where('user_id', $user->getKey()))
                ->orWhereIn('group_id', DB::table('groups')->select('id')->where('system_key', Group::EVERYONE)))
            ->whereHas('navNode', fn ($q) => $q->whereNotNull('space_id'))
            ->with(['group', 'navNode', 'role'])
            ->orderBy('id')
            ->get();
        $permissions = $this->rolePermissions($grants->pluck('role_id')->unique()->values()->all());
        $spaces = Space::query()
            ->whereIn('id', $grants->pluck('navNode.space_id')->unique())
            ->orderByRaw('lower(name)')
            ->get();

        return $spaces->map(function (Space $space) use ($grants, $permissions, $deactivated, $user) {
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
                    'inactive_reason' => match (true) {
                        $group->isArchived() => 'group_archived',
                        $deactivated => 'user_deactivated',
                        // В «Все сотрудники» приглашённый входит после принятия приглашения
                        $group->system_key === Group::EVERYONE && $user->status === UserStatus::Invited => 'user_invited',
                        default => null,
                    },
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
     * выдачи группе «Все сотрудники» всем активным пользователям. Только выдачи на узлы пространств.
     * Колонки: space_id, user_id, group_id (null — личная), role_id.
     */
    private function sourceRows(?string $spaceId = null, ?string $userId = null): Builder
    {
        $grants = fn () => DB::table('access_grants')
            ->join('nav_nodes', fn ($join) => $join->on('nav_nodes.id', '=', 'access_grants.nav_node_id')
                ->whereNotNull('nav_nodes.space_id'))
            ->when($spaceId !== null, fn (Builder $q) => $q->where('nav_nodes.space_id', $spaceId));

        $personal = $grants()
            ->whereNotNull('access_grants.user_id')
            ->select(['nav_nodes.space_id', 'access_grants.user_id', DB::raw('NULL::char(26) AS group_id'), 'access_grants.role_id'])
            ->when($userId !== null, fn (Builder $q) => $q->where('access_grants.user_id', $userId));

        $groups = $grants()
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'access_grants.group_id')
                ->whereNull('groups.archived_at')
                ->whereNull('groups.system_key'))
            ->join('group_members', 'group_members.group_id', '=', 'access_grants.group_id')
            // Деактивированный остаётся в группе, но доступа через неё не получает
            ->join('users', fn ($join) => $join->on('users.id', '=', 'group_members.user_id')
                ->where('users.status', '!=', UserStatus::Deactivated->value))
            ->select(['nav_nodes.space_id', 'group_members.user_id', 'access_grants.group_id', 'access_grants.role_id'])
            ->when($userId !== null, fn (Builder $q) => $q->where('group_members.user_id', $userId));

        // Встроенная группа: состав не хранится — каждый активный пользователь
        $everyone = $grants()
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'access_grants.group_id')
                ->where('groups.system_key', Group::EVERYONE))
            ->crossJoin('users')
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
     */
    private function personalManagersQuery(): Builder
    {
        return DB::table('access_grants')
            ->join('nav_nodes', 'nav_nodes.id', '=', 'access_grants.nav_node_id')
            ->join('role_permissions', fn ($join) => $join->on('role_permissions.role_id', '=', 'access_grants.role_id')
                ->where('role_permissions.permission', Permission::SpaceManageAccess->value))
            ->whereNotNull('access_grants.user_id')
            ->whereNotNull('nav_nodes.space_id')
            ->select(['access_grants.id AS grant_id', 'nav_nodes.space_id', 'access_grants.user_id']);
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
