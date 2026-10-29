<?php

namespace App\Actions\Access;

use App\Enums\Permission;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Closure;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Инвариант «у пространства есть кто управляет доступом» (docs/adr/0024-rights-2.md, план 1.6, В19; ADR-0012): у каждого
 * активного пространства — человек с действующим членством и правом «управление доступом», выданным ЛИЧНО на само
 * пространство или на папку выше. Через группы — дополнительно.
 *
 * Изменение выдач на узле (пространстве или папке — затрагивает все пространства внутри) и перемещение узла проверяются
 * так: какие пространства поддерева были с управляющим до изменения и остались без него после — отказ 422 со списком,
 * транзакция откатывается. Пространство, где управляющего не было и до изменения (например, все деактивированы), изменение
 * не блокирует. Деактивацию инвариант не блокирует — только предупреждает (lastAdminSpaces). Считает AccessResolver.
 */
class AccessManagerGuard
{
    public function __construct(private readonly AccessResolver $resolver) {}

    /**
     * Блокировка дерева до конца транзакции: изменения выдач и структуры идут по очереди (выдача на папку и выдача на
     * пространство внутри неё иначе могли бы разминуться и вместе оставить пространство без управляющего).
     */
    public function lock(): void
    {
        NavNode::lockTree();
    }

    /** Даёт ли роль право «управление доступом» к пространству — гостю и «Все сотрудники» такие роли не выдаются. */
    public function managesAccess(Role $role): bool
    {
        return $this->resolver->rolePermits($role->id, Permission::SpaceManageAccess)
            || $this->resolver->rolePermits($role->id, Permission::FolderManageAccess);
    }

    /**
     * Выполнить изменение и проверить инвариант по поддереву узла. Вызывать внутри транзакции после lock().
     *
     * @template T
     *
     * @param  Closure(): T  $change
     * @param  bool  $moving  перемещение узла — свой текст отказа
     * @return T
     */
    public function guard(NavNode $node, Closure $change, string $field = 'roles', bool $moving = false): mixed
    {
        $before = $this->resolver->unmanagedSpaceIds($node);
        $result = $change();
        $lost = array_values(array_diff($this->resolver->unmanagedSpaceIds($node), $before));

        if ($lost !== []) {
            throw ValidationException::withMessages([$field => $this->message($node, $lost, $moving)]);
        }

        return $result;
    }

    /**
     * Пространства, где пользователь — последний действующий личный управляющий (после его деактивации там не останется
     * управляющего) — предупреждение деактивации.
     *
     * @return Collection<int, Space>
     */
    public function lastAdminSpaces(User $user, ?Company $company): Collection
    {
        return $this->resolver->lastManagerSpaces($user, $company);
    }

    /** @param  list<string>  $spaceIds */
    private function message(NavNode $node, array $spaceIds, bool $moving): string
    {
        // Меняют выдачи самого пространства — прежний текст «Участников»
        if ($node->space_id !== null && ! $moving) {
            return __('selen.spaces.last_admin');
        }

        $names = Space::query()->whereKey($spaceIds)->orderByRaw('lower(name)')->pluck('name')
            ->map(fn (string $name) => "«{$name}»")
            ->implode(', ');

        return __($moving ? 'selen.access.move_unmanaged' : 'selen.access.unmanaged', ['spaces' => $names]);
    }
}
