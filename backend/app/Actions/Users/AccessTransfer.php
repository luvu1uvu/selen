<?php

namespace App\Actions\Users;

use App\Actions\Access\AccessManagerGuard;
use App\Actions\Access\NodeGrants;
use App\Actions\Access\SetNodeAccessAction;
use App\Enums\EventType;
use App\Enums\Permission;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\CompanyPermissionGrant;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;

/**
 * Передача доступа при деактивации (аудит Kaiten «Заменить», решение PM 28.10, п. 5): преемнику копируется доступ
 * уходящего в этой компании — личные роли на папках и пространствах, состав её групп и личные права компании. Копирование, а не
 * перенос: у ушедшего всё остаётся «спящим» и вернётся вместе с ним. Не передаются: администратор компании, люди
 * карточек, владение; права, которые выдаёт только Владелец, — если передаёт не он. Передать доступ могут только Владелец
 * и администратор компании (UserPolicy::transferAccess), преемник — не автор.
 *
 * Где у преемника свои личные роли, остаются его роли; исключение — у уходящего «управление доступом», а у преемника нет:
 * преемник получает и роль уходящего с этим правом (узел не останется без управляющего). Каждое изменение — своим
 * событием (как при ручной выдаче), плюс итоговое user.access_transferred. Вызывается внутри транзакции деактивации.
 */
class AccessTransfer
{
    public const VIA = 'access_transfer';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
        private readonly NodeGrants $grants,
        private readonly SetNodeAccessAction $setAccess,
        private readonly AccessManagerGuard $guard,
    ) {}

    public function handle(User $actor, User $from, User $to, Company $company): void
    {
        $this->copyNodeRoles($actor, $from, $to, $company);
        $this->copyGroups($actor, $from, $to, $company);
        $this->copyCompanyPermissions($actor, $from, $to, $company);

        $this->events->record(EventType::UserAccessTransferred, $actor, $from, ['to_user_id' => $to->id], company: $company);
    }

    /**
     * Личные роли на папках и пространствах этой компании (П2d-1: папки и несколько ролей): где у преемника личных ролей
     * на узле нет — копируются все; где есть — остаются его, но если у уходящего на узле «управление доступом», а у
     * преемника нет — преемник получает и роли уходящего с этим правом (узел не останется без управляющего).
     */
    private function copyNodeRoles(User $actor, User $from, User $to, Company $company): void
    {
        $grants = AccessGrant::query()
            ->inCompany($company)
            ->where('user_id', $from->getKey())
            ->with(['navNode', 'role'])
            ->orderBy('id')
            ->get()
            ->groupBy('nav_node_id');

        foreach ($grants as $theirs) {
            /** @var NavNode $node */
            $node = $theirs->first()->navNode;
            $mine = $this->grants->of($node, $to);
            $roles = $theirs->pluck('role')->all();

            if ($mine->isEmpty()) {
                $this->setAccess->handle($actor, $node, $to, $roles, self::VIA, SetNodeAccessAction::MERGE);

                continue;
            }

            $managing = array_values(array_filter($roles, fn (Role $role) => $this->guard->managesAccess($role)));
            $iManage = $mine->contains(fn (AccessGrant $grant) => $this->guard->managesAccess($grant->role));
            if ($managing !== [] && ! $iManage) {
                $this->setAccess->handle($actor, $node, $to, $managing, self::VIA, SetNodeAccessAction::MERGE);
            }
        }
    }

    private function copyGroups(User $actor, User $from, User $to, Company $company): void
    {
        $groups = $from->groups()->inCompany($company)->whereNull('system_key')->orderBy('groups.id')->get();

        foreach ($groups as $group) {
            /** @var Group $group */
            $group = Group::query()->lockForUpdate()->findOrFail($group->id);
            // В группу с правом, которое выдаёт только Владелец, добавляет только он (аудит П2c-1, S-1)
            $ownerOnly = ! $actor->isOwner() && $this->resolver->groupGrants($group)['owner_permissions'];
            if ($ownerOnly || $group->members()->whereKey($to->id)->exists()) {
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
            if ($ownerOnly || in_array($grant->permission, $mine, true)) {
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
