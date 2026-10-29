<?php

namespace App\Actions\Guests;

use App\Actions\Access\GrantableNodes;
use App\Actions\Access\NodeGrants;
use App\Actions\Access\RevokeNodeAccessAction;
use App\Actions\Access\SetNodeAccessAction;
use App\Enums\EventType;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\EventLog\EventRecorder;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Изменить гостя (П2c): срок доступа и его пространства с ролями — список заменяет прежний, но только в пространствах,
 * где автор может выдавать доступ (GrantableNodes): выдачи гостя в остальных не трогаются. Продление истёкшего срока
 * возвращает доступ — его выдачи «спали».
 */
class UpdateGuestAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly GrantableNodes $grantable,
        private readonly NodeGrants $grants,
        private readonly SetNodeAccessAction $setAccess,
        private readonly RevokeNodeAccessAction $revoke,
    ) {}

    /**
     * @param  list<array{node: NavNode, roles: list<Role>}>  $spaces  только узлы пространств (проверяет запрос)
     */
    public function handle(User $actor, Company $company, User $guest, ?CarbonInterface $expiresAt, array $spaces): User
    {
        return DB::transaction(function () use ($actor, $company, $guest, $expiresAt, $spaces) {
            $guest = User::query()->lockForUpdate()->findOrFail($guest->id);
            $membership = $this->resolver->membership($company, $guest, lock: true);
            if ($membership?->kind !== AccessResolver::GUEST) {
                throw ValidationException::withMessages(['user' => __('selen.guests.not_guest')]);
            }

            $previous = $membership->expires_at === null ? null : Date::parse($membership->expires_at);
            if ($previous?->toIso8601ZuluString() !== $expiresAt?->toIso8601ZuluString()) {
                $this->memberships->setGuestExpiry($company, $guest, $expiresAt);
                $this->events->record(EventType::GuestUpdated, $actor, $guest, [
                    'expires_at' => $expiresAt?->toIso8601ZuluString(),
                ], company: $company);
            }

            $wanted = collect($spaces)->keyBy(fn (array $grant) => $grant['node']->id);
            foreach ($this->grantable->of($actor, $company) as ['node' => $node]) {
                // Гостю — только пространства (папки ему не выдаются, П2c)
                if ($node->isFolder()) {
                    continue;
                }
                $current = $this->grants->of($node, $guest);
                $grant = $wanted->get($node->id);
                if ($grant === null) {
                    if ($current->isNotEmpty()) {
                        $this->revoke->handle($actor, $node, $guest, AddGuestAction::VIA);
                    }

                    continue;
                }

                $this->setAccess->handle($actor, $node, $guest, $grant['roles'], AddGuestAction::VIA);
            }

            return $guest;
        });
    }
}
