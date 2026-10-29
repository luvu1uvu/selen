<?php

namespace App\Actions\Guests;

use App\Actions\Access\SetNodeAccessAction;
use App\Enums\EventType;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AccessOpenedNotification;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\EventLog\EventRecorder;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * «Добавить гостя» (docs/adr/0024-rights-2.md, П2c): сотрудник с действующим «домом» в другой компании получает личный
 * доступ к выбранным пространствам этой компании — роли без «управления доступом», срок по желанию (по умолчанию без
 * срока). Откуда он — не показывается. Неизвестный email и учётная запись без действующего «дома» — один ответ «нет
 * такого сотрудника» (решение PM 28.10, п. 4). Письмо — то же «Вам открыт доступ», без названия компании.
 */
class AddGuestAction
{
    public const VIA = 'guest';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly SetNodeAccessAction $setAccess,
    ) {}

    /**
     * @param  list<array{node: NavNode, roles: list<Role>}>  $spaces  только узлы пространств (проверяет запрос)
     */
    public function handle(User $actor, Company $company, string $email, ?CarbonInterface $expiresAt, array $spaces): User
    {
        $guest = DB::transaction(function () use ($actor, $company, $email, $expiresAt, $spaces) {
            $user = User::query()->where('email', mb_strtolower(trim($email)))->lockForUpdate()->first();
            if ($user === null) {
                throw ValidationException::withMessages(['email' => __('selen.guests.no_employee')]);
            }

            $membership = $this->resolver->membership($company, $user, lock: true);
            if ($user->isOwner() || $membership?->kind === AccessResolver::HOME) {
                throw ValidationException::withMessages(['email' => __('selen.guests.already_member')]);
            }
            if ($membership?->kind === AccessResolver::GUEST) {
                throw ValidationException::withMessages(['email' => __('selen.guests.already_guest')]);
            }
            // Гость — только сотрудник, который может войти: действующий «дом» в другой компании
            if (! $user->isActive() || $this->resolver->lockActiveHomesCount($user) === 0) {
                throw ValidationException::withMessages(['email' => __('selen.guests.no_employee')]);
            }

            $this->memberships->addGuest($company, $user, $expiresAt);
            foreach ($spaces as $grant) {
                $this->setAccess->handle($actor, $grant['node'], $user, $grant['roles'], self::VIA, SetNodeAccessAction::CREATE);
            }

            $this->events->record(EventType::GuestAdded, $actor, $user, [
                'expires_at' => $expiresAt?->toIso8601ZuluString(),
            ], company: $company);

            return $user;
        });

        $guest->notify(new AccessOpenedNotification);

        return $guest;
    }
}
