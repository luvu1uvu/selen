<?php

namespace App\Http\Requests\Admin\Concerns;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\Date;

/**
 * Срок гостя (П2c): в запросе — день (expires_on, YYYY-MM-DD) по часовому поясу того, кто задаёт; доступ действует
 * до конца этого дня, в БД — момент в UTC. Пусто — без срока (по умолчанию, решение PM 23.10).
 */
trait ParsesGuestExpiry
{
    /** @return array<string, mixed> */
    protected function guestExpiryRules(): array
    {
        return ['expires_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today']];
    }

    public function expiresAt(): ?CarbonInterface
    {
        $day = $this->validated('expires_on');
        /** @var User $actor */
        $actor = $this->user();

        return $day === null ? null : Date::createFromFormat('Y-m-d', $day, $actor->timezone)?->endOfDay()->utc();
    }
}
