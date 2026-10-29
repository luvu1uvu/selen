<?php

namespace App\Actions\Access;

use App\Enums\EventType;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

/**
 * Роли субъекта (человек или группа) на узле дерева — папке или пространстве (docs/adr/0024-rights-2.md, П2d-1). Выдача на
 * папку действует на всё внутри (наследование вычисляет AccessResolver). Одна точка изменения выдач для «Участников»
 * пространства, «Доступа…» узла, «Сущностей» группы, приглашения и передачи доступа.
 *
 * Режимы: SET — набор ролей становится ровно таким (снятые роли проверяют инвариант «есть кто управляет доступом»);
 * CREATE — субъекта на узле ещё нет (иначе 422 «уже участник»); MERGE — добавить недостающие роли, свои у субъекта
 * остаются (приглашение, передача доступа).
 *
 * Правила (ADR-0024): человек — действующий участник компании узла (деактивированный и убранный из компании — 422, кроме
 * отключённого Владельцем: выдача заработает, когда его включат); гостю — только пространства и роли без «управления
 * доступом»; группе — не в архиве; «Все сотрудники» — без «управления доступом». $via — откуда изменение (журнал):
 * null — из пространства или «Доступа…», admin_panel, space_created, invitation, access_transfer…
 */
class SetNodeAccessAction
{
    public const SET = 'set';

    public const CREATE = 'create';

    public const MERGE = 'merge';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessManagerGuard $guard,
        private readonly NodeGrants $grants,
        private readonly AccessResolver $resolver,
    ) {}

    /**
     * @param  list<Role>  $roles  не пустой; снять доступ — RevokeNodeAccessAction
     */
    public function handle(User $actor, NavNode $node, User|Group $subject, array $roles, ?string $via = null, string $mode = self::SET): void
    {
        if ($roles === []) {
            throw new InvalidArgumentException('Roles must not be empty: use RevokeNodeAccessAction');
        }

        DB::transaction(function () use ($actor, $node, $subject, $roles, $via, $mode) {
            $this->guard->lock();
            $node = NavNode::query()->findOrFail($node->getKey());
            $current = $this->grants->of($node, $subject);
            $field = $subject instanceof User ? 'user_id' : 'group_id';

            if ($current->isNotEmpty() && $mode === self::CREATE) {
                throw ValidationException::withMessages([$field => __($subject instanceof User ? 'selen.spaces.already_member' : 'selen.groups.already_granted')]);
            }

            $wanted = $mode === self::MERGE
                ? collect($roles)->merge($current->pluck('role'))->unique('id')->values()->all()
                : collect($roles)->unique('id')->values()->all();
            $this->ensureAllowed($node, $subject, $wanted, isNew: $current->isEmpty());

            $from = NodeGrants::values($current->pluck('role'));
            $change = fn () => $this->grants->sync($actor, $node, $subject, $wanted);
            // Снимаются роли — проверить инвариант по поддереву узла
            $diff = $mode === self::SET ? $this->guard->guard($node, $change) : $change();
            if ($diff['added'] === [] && $diff['removed'] === []) {
                return;
            }

            $this->record($actor, $node, $subject, $from, NodeGrants::values($wanted), $via);
        });
    }

    /** @param  list<Role>  $roles */
    private function ensureAllowed(NavNode $node, User|Group $subject, array $roles, bool $isNew): void
    {
        $manages = collect($roles)->contains(fn (Role $role) => $this->guard->managesAccess($role));

        if ($subject instanceof Group) {
            if ($subject->isArchived()) {
                throw ValidationException::withMessages(['group_id' => __('selen.groups.archived')]);
            }
            if ($subject->isSystem() && $manages) {
                throw ValidationException::withMessages(['roles' => __('selen.groups.system_not_admin')]);
            }

            return;
        }

        // Деактивированный или убранный из компании узла (П2c) — выдача «спала» бы. Отключённый Владельцем остаётся
        // сотрудником: выдача заработает, когда его включат. Роли того, у кого выдача уже есть, менять можно
        if ($isNew && (($subject->isDeactivated() && ! $subject->isBlocked()) || ! $this->resolver->isActiveParticipant($node->company_id, $subject))) {
            throw ValidationException::withMessages(['user_id' => __('selen.spaces.member_deactivated')]);
        }

        // Гостю — только личные выдачи на пространства и роли без «управления доступом» (ADR-0024; в БД — триггер
        // access_grants_guest_check)
        if ($this->resolver->isGuest($node->company_id, $subject)) {
            if ($node->isFolder()) {
                throw ValidationException::withMessages(['user_id' => __('selen.guests.spaces_only')]);
            }
            if ($manages) {
                throw ValidationException::withMessages(['roles' => __('selen.guests.no_manage_access')]);
            }
        }
    }

    /**
     * @param  list<string>  $from
     * @param  list<string>  $to
     */
    private function record(User $actor, NavNode $node, User|Group $subject, array $from, array $to, ?string $via): void
    {
        $key = $subject instanceof User ? 'user_id' : 'group_id';
        $payload = fn (array $values) => array_filter([$key => $subject->getKey(), ...$values, 'via' => $via], fn ($value) => $value !== null);

        if ($node->space_id !== null) {
            $space = $node->space;
            $type = match (true) {
                $from === [] => $subject instanceof User ? EventType::SpaceMemberAdded : EventType::SpaceGroupAdded,
                default => $subject instanceof User ? EventType::SpaceMemberRoleChanged : EventType::SpaceGroupRoleChanged,
            };
            $this->events->record($type, $actor, $space, $payload($from === [] ? ['roles' => $to] : ['from' => $from, 'to' => $to]));

            return;
        }

        $type = $from === [] ? EventType::FolderAccessGranted : EventType::FolderAccessChanged;
        $this->events->record($type, $actor, $node, $payload($from === [] ? ['roles' => $to] : ['from' => $from, 'to' => $to]));
    }
}
