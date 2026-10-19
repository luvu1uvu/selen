<?php

namespace App\Services\Access;

use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Group;
use App\Models\Space;
use App\Models\SpaceGroup;
use App\Models\SpaceMember;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Единственное место, где из БД читаются источники доступа к пространствам: личное участие
 * (space_members) и группы (space_groups + group_members). Политики, CardVisibility, списки пространств,
 * участники, подсказка @ получают права только отсюда — напрямую или через Space::accessOf()
 * (docs/adr/0012-groups.md).
 *
 * Действующий источник: личное участие; группа — если она не в архиве, а пользователь не деактивирован;
 * встроенная группа «Все сотрудники» — для каждого активного пользователя (её состав не хранится, а вычисляется
 * здесь: новый сотрудник получает доступ сразу после принятия приглашения, деактивированный теряет его сразу).
 */
class SpaceAccessResolver
{
    /** Права пользователя в одном пространстве — один запрос. Кеширует Space::accessOf(). */
    public function forSpace(User $user, Space $space): SpaceAccess
    {
        $rows = $this->sourceRows(spaceId: $space->getKey(), userId: $user->getKey())->get();

        return $this->toAccess($rows);
    }

    /**
     * Права пользователя во всех его пространствах одним запросом (сайдбар, списки): space_id → права.
     *
     * @return Collection<string, SpaceAccess>
     */
    public function forUser(User $user): Collection
    {
        return $this->sourceRows(userId: $user->getKey())->get()
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
        return $this->sourceRows(spaceId: $space->getKey())->get()
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

    /** Администратор хотя бы одного пространства (лично или через группу) — справочник сотрудников. */
    public function administersAnySpace(User $user): bool
    {
        return DB::query()
            ->fromSub($this->sourceRows(userId: $user->getKey()), 'access')
            ->where('role', SpaceRole::Admin->value)
            ->exists();
    }

    /**
     * Id пространств, открытых встроенной группе «Все сотрудники» (значок «доступно всем» в дереве).
     *
     * @return Collection<int, string>
     */
    public function spacesOpenToEveryone(): Collection
    {
        return DB::table('space_groups')
            ->join('groups', 'groups.id', '=', 'space_groups.group_id')
            ->where('groups.system_key', Group::EVERYONE)
            ->pluck('space_groups.space_id');
    }

    /**
     * Сводка для админки «почему он видит / не видит»: все источники пользователя, включая недействующие,
     * с причиной. Пространства — по названию.
     *
     * @return Collection<int, array{space: Space, access: SpaceAccess, sources: list<array{group: Group|null, role: SpaceRole, own_cards_only: bool, inactive_reason: 'group_archived'|'user_deactivated'|'user_invited'|null}>}>
     */
    public function explain(User $user): Collection
    {
        $deactivated = $user->status === UserStatus::Deactivated;

        $personal = SpaceMember::query()->where('user_id', $user->getKey())->get();
        $grants = SpaceGroup::query()
            ->where(fn ($q) => $q
                ->whereIn('group_id', DB::table('group_members')->select('group_id')->where('user_id', $user->getKey()))
                ->orWhereIn('group_id', DB::table('groups')->select('id')->where('system_key', Group::EVERYONE)))
            ->with('group')
            ->get();
        $spaces = Space::query()
            ->whereIn('id', $personal->pluck('space_id')->merge($grants->pluck('space_id'))->unique())
            ->orderByRaw('lower(name)')
            ->get();

        return $spaces->map(function (Space $space) use ($personal, $grants, $deactivated, $user) {
            $sources = [];

            foreach ($personal->where('space_id', $space->id) as $member) {
                $sources[] = ['group' => null, 'role' => $member->role, 'own_cards_only' => $member->own_cards_only, 'inactive_reason' => null];
            }

            $spaceGrants = $grants->where('space_id', $space->id)
                ->sortBy(fn (SpaceGroup $grant) => mb_strtolower($grant->group->name));

            foreach ($spaceGrants as $grant) {
                $sources[] = [
                    'group' => $grant->group,
                    'role' => $grant->role,
                    'own_cards_only' => $grant->own_cards_only,
                    'inactive_reason' => match (true) {
                        $grant->group->isArchived() => 'group_archived',
                        $deactivated => 'user_deactivated',
                        // В «Все сотрудники» приглашённый входит после принятия приглашения
                        $grant->group->system_key === Group::EVERYONE && $user->status === UserStatus::Invited => 'user_invited',
                        default => null,
                    },
                ];
            }

            $active = array_values(array_filter($sources, fn (array $s) => $s['inactive_reason'] === null));

            return [
                'space' => $space,
                'access' => new SpaceAccess(array_map(
                    fn (array $s) => new AccessSource($s['role'], $s['own_cards_only'], $s['group']?->id),
                    $active,
                )),
                'sources' => $sources,
            ];
        })->values();
    }

    /**
     * Строки действующих источников: личное участие + доступы активных групп активных участников +
     * доступы группы «Все сотрудники» всем активным пользователям.
     * Колонки: space_id, user_id, group_id (null — личное), role, own_cards_only.
     */
    private function sourceRows(?string $spaceId = null, ?string $userId = null): Builder
    {
        $personal = DB::table('space_members')
            ->select(['space_id', 'user_id', DB::raw('NULL::char(26) AS group_id'), 'role', 'own_cards_only'])
            ->when($spaceId !== null, fn (Builder $q) => $q->where('space_id', $spaceId))
            ->when($userId !== null, fn (Builder $q) => $q->where('user_id', $userId));

        $groups = DB::table('space_groups')
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'space_groups.group_id')
                ->whereNull('groups.archived_at')
                ->whereNull('groups.system_key'))
            ->join('group_members', 'group_members.group_id', '=', 'space_groups.group_id')
            // Деактивированный остаётся в группе, но доступа через неё не получает
            ->join('users', fn ($join) => $join->on('users.id', '=', 'group_members.user_id')
                ->where('users.status', '!=', UserStatus::Deactivated->value))
            ->select([
                'space_groups.space_id',
                'group_members.user_id',
                'space_groups.group_id',
                'space_groups.role',
                'space_groups.own_cards_only',
            ])
            ->when($spaceId !== null, fn (Builder $q) => $q->where('space_groups.space_id', $spaceId))
            ->when($userId !== null, fn (Builder $q) => $q->where('group_members.user_id', $userId));

        // Встроенная группа: состав не хранится — каждый активный пользователь
        $everyone = DB::table('space_groups')
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'space_groups.group_id')
                ->where('groups.system_key', Group::EVERYONE))
            ->crossJoin('users')
            ->where('users.status', UserStatus::Active->value)
            ->select([
                'space_groups.space_id',
                'users.id AS user_id',
                'space_groups.group_id',
                'space_groups.role',
                'space_groups.own_cards_only',
            ])
            ->when($spaceId !== null, fn (Builder $q) => $q->where('space_groups.space_id', $spaceId))
            ->when($userId !== null, fn (Builder $q) => $q->where('users.id', $userId));

        return $personal->unionAll($groups)->unionAll($everyone);
    }

    /** @param  Collection<int, \stdClass>  $rows */
    private function toAccess(Collection $rows): SpaceAccess
    {
        return new SpaceAccess($rows
            // Личное участие — первым (порядок важен только для показа)
            ->sortBy(fn (\stdClass $row) => $row->group_id === null ? '' : $row->group_id)
            ->map(fn (\stdClass $row) => new AccessSource(
                SpaceRole::from($row->role),
                (bool) $row->own_cards_only,
                $row->group_id === null ? null : trim($row->group_id),
            ))
            ->values()
            ->all());
    }
}
