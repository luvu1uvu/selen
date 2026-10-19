<?php

namespace App\Console\Commands;

use App\Enums\EventType;
use App\Enums\UserRole;
use App\Models\EventLogEntry;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Кто сейчас Владелец (ADR-0017) и с какого момента — по журналу событий. Стенд PM: make pm-owner-show.
 */
#[Signature('app:owner')]
#[Description('Показать Владельца системы')]
class ShowOwnerCommand extends Command
{
    public function handle(): int
    {
        $owner = User::query()->where('role', UserRole::Owner)->first();

        if ($owner === null) {
            $this->components->warn('Владелец не назначен. Назначить: php artisan app:transfer-ownership EMAIL'
                .' (на стенде PM — make pm-transfer-ownership EMAIL=…).');

            return self::FAILURE;
        }

        $since = EventLogEntry::query()
            ->where('event_type', EventType::UserOwnershipTransferred)
            ->where('subject_type', 'user')
            ->where('subject_id', $owner->id)
            ->latest('occurred_at')
            ->first();

        $this->components->twoColumnDetail('Владелец', "{$owner->name} <{$owner->email}>");
        if ($since !== null) {
            $via = $since->payload['via'] ?? null;
            $this->components->twoColumnDetail('С', $since->occurred_at->toIso8601ZuluString()
                .(is_string($via) ? " ({$via})" : ''));
        }

        return self::SUCCESS;
    }
}
