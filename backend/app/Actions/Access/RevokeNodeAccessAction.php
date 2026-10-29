<?php

namespace App\Actions\Access;

use App\Enums\EventType;
use App\Models\AccessGrant;
use App\Models\Group;
use App\Models\NavNode;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Снять доступ субъекта к узлу — все его роли на папке или пространстве (docs/adr/0024-rights-2.md, П2d-1). Человек
 * и группа остаются; унаследованные выдачи (на папки выше) не трогаются — они меняются на своей папке. Снятие, после
 * которого пространство останется без управляющего, — 422 (AccessManagerGuard). В журнале — прежние роли.
 */
class RevokeNodeAccessAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessManagerGuard $guard,
        private readonly NodeGrants $grants,
    ) {}

    public function handle(User $actor, NavNode $node, User|Group $subject, ?string $via = null): void
    {
        DB::transaction(function () use ($actor, $node, $subject, $via) {
            $this->guard->lock();
            $node = NavNode::query()->findOrFail($node->getKey());
            $current = $this->grants->of($node, $subject);
            if ($current->isEmpty()) {
                throw (new ModelNotFoundException)->setModel(AccessGrant::class);
            }

            $roles = NodeGrants::values($current->pluck('role'));
            $this->guard->guard($node, fn () => $current->each(fn (AccessGrant $grant) => $grant->delete()));

            $key = $subject instanceof User ? 'user_id' : 'group_id';
            $payload = array_filter([$key => $subject->getKey(), 'roles' => $roles, 'via' => $via], fn ($value) => $value !== null);

            if ($node->space_id !== null) {
                $type = $subject instanceof User ? EventType::SpaceMemberRemoved : EventType::SpaceGroupRemoved;
                $this->events->record($type, $actor, $node->space, $payload);

                return;
            }

            $this->events->record(EventType::FolderAccessRevoked, $actor, $node, $payload);
        });
    }

    /**
     * Снять все выдачи на пустую папку перед её удалением навсегда (LATER-43): пространств внутри нет — инвариант не
     * затронут. Каждый субъект — событием снятия. Вызывать внутри транзакции удаления, под блокировкой дерева.
     */
    public function revokeAllOnEmptyFolder(User $actor, NavNode $folder, string $via): void
    {
        $grants = AccessGrant::query()->where('nav_node_id', $folder->getKey())->with('role')->orderBy('id')->get();

        foreach ($grants->groupBy(fn (AccessGrant $grant) => $grant->user_id ?? 'g:'.$grant->group_id) as $same) {
            /** @var AccessGrant $first */
            $first = $same->first();
            $key = $first->user_id !== null ? 'user_id' : 'group_id';
            $roles = NodeGrants::values($same->pluck('role'));
            $same->each(fn (AccessGrant $grant) => $grant->delete());
            $this->events->record(EventType::FolderAccessRevoked, $actor, $folder, [
                $key => $first->user_id ?? $first->group_id,
                'roles' => $roles,
                'via' => $via,
            ]);
        }
    }
}
