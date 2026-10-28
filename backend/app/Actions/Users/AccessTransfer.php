<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\Permission;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\CompanyPermissionGrant;
use App\Models\Group;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;

/**
 * Передача доступа при деактивации (аудит Kaiten «Заменить», решение PM 28.10, п. 5): преемнику копируется доступ
 * уходящего в этой компании — личные роли на пространствах, состав её групп и личные права компании. Копирование, а не
 * перенос: у ушедшего всё остаётся «спящим» и вернётся вместе с ним. Не передаются: администратор компании, люди
 * карточек, владение; права, которые выдаёт только Владелец, — если передаёт не он. Передать доступ могут только Владелец
 * и администратор компании (UserPolicy::transferAccess), преемник — не автор.
 *
 * Где у преемника своя личная роль, остаётся его роль; исключение — у уходящего «управление доступом», а у преемника нет:
 * преемник получает роль уходящего (пространство не останется без управляющего). Каждое изменение — своим событием
 * (как при ручной выдаче), плюс итоговое user.access_transferred. Вызывается внутри транзакции деактивации.
 */
class AccessTransfer
{
    public const VIA = 'access_transfer';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
    ) {}

    public function handle(User $actor, User $from, User $to, Company $company): void
    {
        $this->copySpaceRoles($actor, $from, $to, $company);
        $this->copyGroups($actor, $from, $to, $company);
        $this->copyCompanyPermissions($actor, $from, $to, $company);

        $this->events->record(EventType::UserAccessTransferred, $actor, $from, ['to_user_id' => $to->id], company: $company);
    }

    private function copySpaceRoles(User $actor, User $from, User $to, Company $company): void
    {
        $grants = AccessGrant::query()
            ->inCompany($company)
            ->where('user_id', $from->getKey())
            ->whereHas('navNode', fn ($q) => $q->whereNotNull('space_id'))
            ->with(['navNode', 'role'])
            ->orderBy('id')
            ->get();

        foreach ($grants as $grant) {
            /** @var Space $space */
            $space = Space::query()->lockForUpdate()->findOrFail($grant->navNode->space_id);
            $mine = AccessGrant::query()->onSpace($space)->where('user_id', $to->getKey())->with('role')->first();

            if ($mine === null) {
                AccessGrant::query()->forceCreate([
                    'company_id' => $grant->company_id,
                    'nav_node_id' => $grant->nav_node_id,
                    'user_id' => $to->getKey(),
                    'role_id' => $grant->role_id,
                    'granted_by' => $actor->getKey(),
                ]);
                $this->events->record(EventType::SpaceMemberAdded, $actor, $space, array_filter([
                    'user_id' => $to->id,
                    'role' => $grant->legacyRole()?->value,
                    'via' => self::VIA,
                ]));

                continue;
            }

            $manages = fn (AccessGrant $g) => $this->resolver->rolePermits($g->role_id, Permission::SpaceManageAccess);
            if ($manages($grant) && ! $manages($mine)) {
                $previous = $mine->legacyRole();
                $mine->forceFill(['role_id' => $grant->role_id])->save();
                $this->events->record(EventType::SpaceMemberRoleChanged, $actor, $space, array_filter([
                    'user_id' => $to->id,
                    'from' => $previous?->value,
                    'to' => $grant->legacyRole()?->value,
                    'via' => self::VIA,
                ]));
            }
        }
    }

    private function copyGroups(User $actor, User $from, User $to, Company $company): void
    {
        $groups = $from->groups()->inCompany($company)->whereNull('system_key')->orderBy('groups.id')->get();

        foreach ($groups as $group) {
            /** @var Group $group */
            $group = Group::query()->lockForUpdate()->findOrFail($group->id);
            if ($group->members()->whereKey($to->id)->exists()) {
                continue;
            }

            $group->members()->attach($to->id, ['added_by' => $actor->id, 'created_at' => Date::now()]);
            $this->events->record(EventType::GroupMemberAdded, $actor, $group, ['user_id' => $to->id, 'via' => self::VIA]);
        }
    }

    private function copyCompanyPermissions(User $actor, User $from, User $to, Company $company): void
    {
        $mine = CompanyPermissionGrant::query()->inCompany($company)->where('user_id', $to->getKey())->pluck('permission')->all();
        $theirs = CompanyPermissionGrant::query()->inCompany($company)->where('user_id', $from->getKey())->orderBy('id')->get();

        foreach ($theirs as $grant) {
            // Права, которые выдаёт только Владелец, передаёт только он (решение PM 23.10, В17)
            $ownerOnly = in_array($grant->permission, Permission::ownerGranted(), true) && ! $actor->isOwner();
            if ($ownerOnly || in_array($grant->permission->value, $mine, true)) {
                continue;
            }

            CompanyPermissionGrant::query()->forceCreate([
                'company_id' => $company->getKey(),
                'user_id' => $to->getKey(),
                'permission' => $grant->permission,
                'granted_by' => $actor->getKey(),
            ]);
            $this->events->record(EventType::CompanyPermissionGranted, $actor, $to, [
                'permission' => $grant->permission->value,
                'user_id' => $to->id,
                'via' => self::VIA,
            ], company: $company);
        }
    }
}
