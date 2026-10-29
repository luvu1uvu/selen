<?php

namespace App\Actions\Guests;

use App\Actions\Access\NodeGrants;
use App\Enums\EventType;
use App\Models\AccessGrant;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\User;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * «Убрать гостя» (П2c, решение PM 28.10, п. 6): снимаются все его выдачи в компании (каждая — событием, как при снятии
 * участника) и само гостевое членство — при новом добавлении прежние выдачи не оживут. Гость не управляет доступом,
 * поэтому инвариант «у пространства есть администратор» снятие не нарушает.
 */
class RemoveGuestAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
    ) {}

    public function handle(User $actor, Company $company, User $guest): void
    {
        DB::transaction(function () use ($actor, $company, $guest) {
            $guest = User::query()->lockForUpdate()->findOrFail($guest->id);
            if ($this->resolver->membership($company, $guest, lock: true)?->kind !== AccessResolver::GUEST) {
                throw ValidationException::withMessages(['user' => __('selen.guests.not_guest')]);
            }

            // У гостя — только выдачи на пространства (П2c); несколько ролей на пространстве — одно событие (П2d-1)
            $grants = AccessGrant::query()->inCompany($company)->where('user_id', $guest->id)->with(['navNode.space', 'role'])->orderBy('id')->get();
            NavNode::lockTree();
            foreach ($grants->groupBy('nav_node_id') as $same) {
                /** @var AccessGrant $first */
                $first = $same->first();
                $roles = NodeGrants::values($same->pluck('role'));
                $same->each(fn (AccessGrant $grant) => $grant->delete());
                $this->events->record(EventType::SpaceMemberRemoved, $actor, $first->navNode->space, [
                    'user_id' => $guest->id,
                    'roles' => $roles,
                    'via' => AddGuestAction::VIA,
                ]);
            }

            $this->memberships->removeGuest($company, $guest);
            $this->events->record(EventType::GuestRemoved, $actor, $guest, company: $company);
        });
    }
}
