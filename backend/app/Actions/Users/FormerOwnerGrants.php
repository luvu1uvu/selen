<?php

namespace App\Actions\Users;

use App\Actions\Access\NodeGrants;
use App\Enums\EventType;
use App\Models\AccessGrant;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * «Спящие» выдачи бывшего Владельца (решение PM 28.10, п. 6): Владелец — участник всех компаний, ему выдают доступ
 * и там, где он не сотрудник. После передачи владения такие выдачи перестали бы действовать, а при добавлении ему
 * «дома» или гостевого доступа ожили бы молча — поэтому при передаче они снимаются (каждая — событием снятия
 * участника). Окно передачи заранее показывает, к чему он потеряет доступ и какие пространства останутся без
 * администратора (предупреждение; отказ по инварианту — только при нескольких компаниях, отложено в П2d-1).
 */
class FormerOwnerGrants
{
    public const VIA = 'ownership_transferred';

    public function __construct(
        private readonly AccessResolver $resolver,
        private readonly EventRecorder $events,
    ) {}

    /**
     * Пространства, к которым у Владельца личный доступ в компаниях, где он не «дом», и те из них, где он — последний
     * действующий личный администратор.
     *
     * @return array{lost: Collection<int, Space>, unmanaged: Collection<int, Space>}
     */
    public function impact(User $owner): array
    {
        $lost = Space::query()
            ->whereIn('id', $this->grants($owner)->with('navNode')->get()->pluck('navNode.space_id')->filter())
            ->orderByRaw('lower(name)')
            ->get();
        $last = $this->resolver->lastManagerSpaces($owner)->modelKeys();

        return ['lost' => $lost, 'unmanaged' => $lost->filter(fn (Space $space) => in_array($space->id, $last, true))->values()];
    }

    /**
     * Снять их (внутри транзакции передачи владения): выдачи на пространства и на папки (П2d-1) — по узлу, все роли
     * одним событием. Инвариант «есть кто управляет доступом» здесь — предупреждение окна передачи (отказ 422 — только
     * при нескольких компаниях, отложено, ADR-0026).
     */
    public function revoke(?User $actor, User $formerOwner): void
    {
        NavNode::lockTree();
        $grants = $this->grants($formerOwner)->with(['navNode.space', 'role'])->orderBy('id')->get();
        foreach ($grants->groupBy('nav_node_id') as $same) {
            /** @var AccessGrant $first */
            $first = $same->first();
            $payload = ['user_id' => $formerOwner->id, 'roles' => NodeGrants::values($same->pluck('role')), 'via' => self::VIA];
            $same->each(fn (AccessGrant $grant) => $grant->delete());
            $first->navNode->space !== null
                ? $this->events->record(EventType::SpaceMemberRemoved, $actor, $first->navNode->space, $payload)
                : $this->events->record(EventType::FolderAccessRevoked, $actor, $first->navNode, $payload);
        }
    }

    /** @return Builder<AccessGrant> */
    private function grants(User $owner): Builder
    {
        return AccessGrant::query()
            ->where('user_id', $owner->getKey())
            // Где он «дом» или гость — его выдачи законны и остаются
            ->whereNotIn('company_id', $this->resolver->membershipCompanyIds($owner));
    }
}
