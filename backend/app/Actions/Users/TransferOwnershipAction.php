<?php

namespace App\Actions\Users;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Передача владения (ADR-0017): получатель становится Владельцем, бывший Владелец — администратором своих компаний
 * (ADR-0024). Событие — без компании («о человеке»: его видят администраторы компаний нового и бывшего Владельца).
 * Обе строки меняются в одной транзакции (отложенный триггер БД проверяет, что Владелец не пропал).
 * Из интерфейса — Владелец с подтверждением паролем (TransferOwnershipRequest), аварийно — команда
 * app:transfer-ownership на сервере ($actor = null); она же назначает Владельца, если его нет.
 */
class TransferOwnershipAction
{
    public function __construct(private readonly EventRecorder $events) {}

    /**
     * @param  string  $via  admin_panel | console
     */
    public function handle(?User $actor, User $to, string $via): User
    {
        return DB::transaction(function () use ($actor, $to, $via) {
            // Строки бывшего и нового Владельца — под блокировкой, в одном порядке для всех передач
            $locked = User::query()
                ->where(fn ($q) => $q->where('role', UserRole::Owner)->orWhereKey($to->getKey()))
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $to = $locked->firstWhere('id', $to->id) ?? throw ValidationException::withMessages(['user_id' => __('selen.not_found')]);
            $from = $locked->first(fn (User $user) => $user->isOwner());

            if ($to->isOwner()) {
                throw ValidationException::withMessages(['user_id' => __('selen.users.already_owner')]);
            }
            if (! $to->isActive()) {
                throw ValidationException::withMessages(['user_id' => __('selen.users.owner_target_not_active')]);
            }
            // Передаёт только действующий Владелец: между открытием диалога и запросом владение могли передать
            if ($actor !== null && ! $actor->is($from)) {
                throw ValidationException::withMessages(['user_id' => __('selen.users.no_longer_owner')]);
            }

            // Бывший Владелец остаётся администратором — своих компаний (ADR-0024: администраторы — у компаний)
            $from?->forceFill(['role' => UserRole::Member])->save();
            if ($from !== null) {
                $from->companies()->newPivotQuery()->update(['is_admin' => true, 'updated_at' => now()]);
            }
            $to->forceFill(['role' => UserRole::Owner])->save();

            $this->events->record(EventType::UserOwnershipTransferred, $actor, $to, [
                'from_user_id' => $from?->id,
                'to_user_id' => $to->id,
                'via' => $via,
            ]);

            return $to;
        });
    }
}
