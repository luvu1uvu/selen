<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Models\Company;
use App\Models\EmailChangeRequest;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Отменить смену email, которая ждёт подтверждения (П2c-2, LATER-9): ссылка из письма на новый адрес перестаёт работать,
 * email остаётся прежним. Событие — без адресов.
 */
class CancelEmailChangeAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly UserLock $lock,
    ) {}

    public function handle(User $actor, User $user, Company $company): User
    {
        return DB::transaction(function () use ($actor, $user, $company) {
            $user = $this->lock->lock($actor, $user, $company);

            if (EmailChangeRequest::query()->whereKey($user->id)->delete() === 0) {
                throw ValidationException::withMessages(['email' => __('selen.email_change.none')]);
            }

            $this->events->record(EventType::UserEmailChangeCancelled, $actor, $user, company: $company);

            return $user->setRelation('emailChangeRequest', null);
        });
    }
}
