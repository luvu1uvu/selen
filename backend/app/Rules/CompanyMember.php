<?php

namespace App\Rules;

use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Ссылка на человека в теле запроса — только на «дом» этой компании (ADR-0024: правило «в этой компании» вместо
 * голого exists). Человек другой компании неотличим от несуществующего: то же сообщение, что у exists.
 */
class CompanyMember implements ValidationRule
{
    public function __construct(
        private readonly Company|string $company,
        private readonly bool $notDeactivated = false,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $exists = is_string($value) && User::query()
            ->whereKey($value)
            ->whereIn('id', app(AccessResolver::class)->companyMemberIds($this->company))
            ->when($this->notDeactivated, fn ($q) => $q->where('status', '!=', UserStatus::Deactivated))
            ->exists();

        if (! $exists) {
            $fail('validation.exists')->translate();
        }
    }
}
