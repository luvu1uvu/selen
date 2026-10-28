<?php

namespace App\Actions\Companies;

use App\Enums\EventType;
use App\Enums\Permission;
use App\Models\Company;
use App\Models\CompanyPermissionGrant;
use App\Models\Group;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * «Права компании» галочками у человека и у группы (docs/adr/0024-rights-2.md, П2c): итоговый набор выданных лично
 * этому субъекту прав — лишние снимаются, новые выдаются, каждое изменение — событием компании. Менять можно только
 * права из editableBy(): Владелец — любые выдаваемые, администратор компании — кроме «удалять пользователей» и
 * «аналитика трудозатрат» (их выдаёт только Владелец, решение PM 23.10, В17). Кто вообще может менять — политики.
 */
class SetCompanyPermissionsAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * Права, которые автор может выдавать и снимать.
     *
     * @return list<Permission>
     */
    public static function editableBy(User $actor): array
    {
        return array_values(array_filter(
            Permission::grantable(),
            fn (Permission $permission) => $actor->isOwner() || ! in_array($permission, Permission::ownerGranted(), true),
        ));
    }

    /**
     * @param  list<Permission>  $permissions  выданные субъекту лично права после изменения
     */
    public function handle(User $actor, Company $company, User|Group $subject, array $permissions): void
    {
        $editable = self::editableBy($actor);
        foreach ($permissions as $permission) {
            if (! in_array($permission, $editable, true)) {
                throw ValidationException::withMessages(['permissions' => __('selen.company_permissions.owner_only')]);
            }
        }

        DB::transaction(function () use ($actor, $company, $subject, $permissions, $editable) {
            // Строка субъекта — под блокировкой: параллельные изменения его прав идут по очереди
            $subject->newQuery()->lockForUpdate()->findOrFail($subject->getKey());
            $column = $subject instanceof User ? 'user_id' : 'group_id';
            $current = CompanyPermissionGrant::query()->inCompany($company)->where($column, $subject->getKey())->get()
                ->keyBy(fn (CompanyPermissionGrant $grant) => $grant->permission->value);

            foreach ($editable as $permission) {
                $wanted = in_array($permission, $permissions, true);
                $grant = $current->get($permission->value);

                if ($wanted && $grant === null) {
                    CompanyPermissionGrant::query()->forceCreate([
                        'company_id' => $company->getKey(),
                        $column => $subject->getKey(),
                        'permission' => $permission,
                        'granted_by' => $actor->getKey(),
                    ]);
                    $this->record(EventType::CompanyPermissionGranted, $actor, $company, $subject, $column, $permission);
                } elseif (! $wanted && $grant !== null) {
                    $grant->delete();
                    $this->record(EventType::CompanyPermissionRevoked, $actor, $company, $subject, $column, $permission);
                }
            }

            $company->forgetResolvedPermissions();
        });
    }

    private function record(EventType $type, User $actor, Company $company, User|Group $subject, string $column, Permission $permission): void
    {
        $this->events->record($type, $actor, $subject, [
            'permission' => $permission->value,
            $column => $subject->getKey(),
        ], company: $company);
    }
}
