<?php

namespace Tests\Support;

use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\AccessSource;
use App\Services\Access\SpaceAccess;
use Illuminate\Support\Facades\DB;
use stdClass;

/**
 * Снимок итоговых прав всех пользователей во всех пространствах — для проверки «права до и после перехода
 * совпадают» («Права 2.0», П2a; журнал, раздел 6.2): тест миграции, демо-данные, копия бэкапа стенда.
 *
 * legacy() — ЗАМОРОЖЕННАЯ копия прежнего правила (SpaceAccessResolver и SpaceRole до П2a): читает space_members
 * и space_groups, роли admin | editor | commenter и флаг own_cards_only. Не менять вместе с кодом приложения.
 * current() — то же самое через AccessResolver и права каталога. Формат у обоих одинаковый: сравниваются как есть.
 */
final class AccessSnapshot
{
    /**
     * Действия, которые проверяют политики, и какой роли они были доступны до П2a:
     * admin — canManageSpace, editor — canEditCards (admin и editor), any — любая роль.
     */
    public const ACTIONS = [
        'space.update' => 'admin',
        'space.manage_access' => 'admin',
        'board.create' => 'admin',
        'board.update' => 'admin',
        'board.delete' => 'admin',
        'card.create' => 'editor',
        'card.update' => 'editor',
        'card.move' => 'editor',
        'card.invite' => 'editor',
        'card.comment' => 'any',
    ];

    /**
     * Прежнее правило по space_members и space_groups (до миграции П2a).
     *
     * @return array<string, mixed>
     */
    public static function legacy(): array
    {
        $personal = DB::table('space_members')
            ->select(['space_id', 'user_id', DB::raw('NULL::char(26) AS group_id'), 'role', 'own_cards_only']);
        $groups = DB::table('space_groups')
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'space_groups.group_id')
                ->whereNull('groups.archived_at')->whereNull('groups.system_key'))
            ->join('group_members', 'group_members.group_id', '=', 'space_groups.group_id')
            ->join('users', fn ($join) => $join->on('users.id', '=', 'group_members.user_id')
                ->where('users.status', '!=', 'deactivated'))
            ->select(['space_groups.space_id', 'group_members.user_id', 'space_groups.group_id', 'space_groups.role', 'space_groups.own_cards_only']);
        $everyone = DB::table('space_groups')
            ->join('groups', fn ($join) => $join->on('groups.id', '=', 'space_groups.group_id')
                ->where('groups.system_key', 'everyone'))
            ->crossJoin('users')
            ->where('users.status', 'active')
            ->select(['space_groups.space_id', 'users.id AS user_id', 'space_groups.group_id', 'space_groups.role', 'space_groups.own_cards_only']);

        $rows = $personal->unionAll($groups)->unionAll($everyone)->get();
        $pairs = [];
        foreach ($rows->groupBy(fn (stdClass $row) => "{$row->space_id}:{$row->user_id}") as $key => $sources) {
            $pairs[$key] = self::pair(
                $sources->map(fn (stdClass $row) => [
                    'group' => $row->group_id === null ? null : trim($row->group_id),
                    'role' => $row->role,
                    'own' => (bool) $row->own_cards_only,
                    'allows' => fn (string $action) => match (self::ACTIONS[$action]) {
                        'admin' => $row->role === 'admin',
                        'editor' => in_array($row->role, ['admin', 'editor'], true),
                        'any' => true,
                    },
                ])->all(),
            );
        }

        $admins = DB::table('space_members')
            ->join('users', 'users.id', '=', 'space_members.user_id')
            ->where('space_members.role', 'admin')
            ->where('users.status', '!=', 'deactivated')
            ->select(['space_members.space_id', 'space_members.user_id'])
            ->get();
        $openToEveryone = DB::table('space_groups')
            ->join('groups', 'groups.id', '=', 'space_groups.group_id')
            ->where('groups.system_key', 'everyone')
            ->pluck('space_groups.space_id');
        $managersAnywhere = $rows->where('role', 'admin')->pluck('user_id');

        return self::finish($pairs, $admins->map(fn (stdClass $r) => [$r->space_id, $r->user_id])->all(), $openToEveryone->all(), $managersAnywhere->all());
    }

    /**
     * То же по новой модели: AccessResolver, права каталога.
     *
     * @return array<string, mixed>
     */
    public static function current(): array
    {
        $resolver = app(AccessResolver::class);
        $pairs = [];
        $admins = [];

        foreach (Space::query()->orderBy('id')->get() as $space) {
            foreach ($resolver->usersWithAccess($space) as $userId => $access) {
                $pairs["{$space->id}:{$userId}"] = self::fromAccess($access);
            }
            foreach (User::query()->orderBy('id')->get() as $user) {
                // Инвариант «есть администратор»: тот же вопрос, что задаёт SpaceAdminGuard
                if ($user->status !== UserStatus::Deactivated
                    && $resolver->forSpace($user, $space)->personal()?->permits(Permission::SpaceManageAccess)) {
                    $admins[] = [$space->id, $user->id];
                }
            }
        }

        // Права во всех пространствах пользователя (сайдбар, списки) — тот же ответ, что по пространству
        foreach (User::query()->orderBy('id')->get() as $user) {
            foreach ($resolver->forUser($user) as $spaceId => $access) {
                if (self::fromAccess($access) !== ($pairs["{$spaceId}:{$user->id}"] ?? null)) {
                    $pairs["{$spaceId}:{$user->id}"] = ['forUser() расходится с usersWithAccess()'];
                }
            }
        }

        $managersAnywhere = User::query()->get()->filter(fn (User $user) => $resolver->managesAccessAnywhere($user))->modelKeys();

        return self::finish($pairs, $admins, $resolver->spacesOpenToEveryone()->all(), $managersAnywhere);
    }

    private static function fromAccess(SpaceAccess $access): array
    {
        return self::pair(array_map(fn (AccessSource $source) => [
            'group' => $source->groupId,
            'role' => $source->legacyRole()?->value,
            'own' => $source->ownCardsOnly(),
            'allows' => fn (string $action) => $source->permits(Permission::from($action)),
        ], $access->sources));
    }

    /**
     * Права одной пары «пользователь × пространство» по источникам.
     *
     * @param  list<array{group: string|null, role: string|null, own: bool, allows: \Closure(string): bool}>  $sources
     * @return array<string, mixed>
     */
    private static function pair(array $sources): array
    {
        $roles = array_column($sources, 'role');
        $allows = [];
        foreach (array_keys(self::ACTIONS) as $action) {
            $permitting = array_filter($sources, fn (array $s) => ($s['allows'])($action));
            $allows[$action] = [
                'any' => $permitting !== [],
                'foreign_card' => array_filter($permitting, fn (array $s) => ! $s['own']) !== [],
                'own_card' => $permitting !== [],
            ];
        }
        $list = array_map(fn (array $s) => ($s['group'] ?? 'personal').':'.$s['role'].($s['own'] ? ':own' : ''), $sources);
        sort($list);

        return [
            'role' => collect([SpaceRole::Admin, SpaceRole::Editor, SpaceRole::Commenter])
                ->first(fn (SpaceRole $role) => in_array($role->value, $roles, true))?->value,
            'sees_all_cards' => array_filter($sources, fn (array $s) => ! $s['own']) !== [],
            'sources' => $list,
            'allows' => $allows,
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $pairs
     * @param  list<array{string, string}>  $admins
     * @param  list<string>  $openToEveryone
     * @param  list<string>  $managersAnywhere
     * @return array<string, mixed>
     */
    private static function finish(array $pairs, array $admins, array $openToEveryone, array $managersAnywhere): array
    {
        ksort($pairs);
        $adminKeys = array_map(fn (array $a) => "{$a[0]}:{$a[1]}", $admins);
        sort($adminKeys);
        sort($openToEveryone);
        $managersAnywhere = array_values(array_unique($managersAnywhere));
        sort($managersAnywhere);

        return [
            'pairs' => $pairs,
            'active_personal_admins' => $adminKeys,
            'open_to_everyone' => array_values(array_unique($openToEveryone)),
            'manage_access_anywhere' => $managersAnywhere,
        ];
    }
}
