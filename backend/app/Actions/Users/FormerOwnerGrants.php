<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\AccessGrant;
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
 * администратора (предупреждение; отказ по инварианту — П2d).
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
            ->whereIn('id', $this->grants($owner)->with('navNode')->get()->pluck('navNode.space_id'))
            ->orderByRaw('lower(name)')
            ->get();
        $last = $this->resolver->lastManagerSpaces($owner)->modelKeys();

        return ['lost' => $lost, 'unmanaged' => $lost->filter(fn (Space $space) => in_array($space->id, $last, true))->values()];
    }

    /** Снять их (внутри транзакции передачи владения). */
    public function revoke(?User $actor, User $formerOwner): void
    {
        foreach ($this->grants($formerOwner)->with(['navNode', 'role'])->orderBy('id')->get() as $grant) {
            $space = Space::query()->lockForUpdate()->findOrFail($grant->navNode->space_id);
            $role = $grant->legacyRole();
            $grant->delete();
            $this->events->record(EventType::SpaceMemberRemoved, $actor, $space, array_filter([
                'user_id' => $formerOwner->id,
                'role' => $role?->value,
                'via' => self::VIA,
            ]));
        }
    }

    /** @return Builder<AccessGrant> */
    private function grants(User $owner): Builder
    {
        return AccessGrant::query()
            ->where('user_id', $owner->getKey())
            ->whereNotIn('company_id', $owner->companies()->pluck('companies.id'))
            ->whereHas('navNode', fn ($q) => $q->whereNotNull('space_id'));
    }
}
