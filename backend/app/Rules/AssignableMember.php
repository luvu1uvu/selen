<?php

namespace App\Rules;

use App\Enums\UserStatus;
use App\Models\Space;
use App\Models\User;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Кого можно назначить на карточку: участника пространства (любая роль), активного или приглашённого.
 * Деактивированного — нельзя. Уже назначенный (current) проходит проверку, даже если его потом
 * деактивировали или исключили из пространства: повторная отправка того же значения — не назначение.
 */
class AssignableMember implements ValidationRule
{
    public function __construct(
        private readonly Space $space,
        private readonly ?string $current = null,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if ($value === $this->current) {
            return;
        }

        $user = is_string($value) ? User::query()->find($value) : null;
        // Доступ — только через accessOf (ADR-0005, ADR-0012): лично или через группу
        $assignable = $user !== null
            && $user->status !== UserStatus::Deactivated
            && $this->space->accessOf($user)->isMember();

        if (! $assignable) {
            $fail(__('selen.cards.not_assignable'));
        }
    }
}
