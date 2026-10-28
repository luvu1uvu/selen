<?php

namespace App\Rules;

use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Ссылка на человека в теле запроса — только на действующий «дом» этой компании (ADR-0024: правило «в этой компании»
 * вместо голого exists). Человек другой компании, гость и убранный из компании неотличимы от несуществующего: то же
 * сообщение, что у exists. withOwner — ещё и Владелец (личная выдача доступа: он участник всех компаний); состав групп —
 * только «дома»; гостей добавляют только из админки (П2c).
 */
class CompanyMember implements ValidationRule
{
    public function __construct(
        private readonly Company|string $company,
        private readonly bool $notDeactivated = false,
        private readonly bool $withOwner = false,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $resolver = app(AccessResolver::class);
        $exists = is_string($value) && User::query()
            ->whereKey($value)
            ->whereIn('id', $this->withOwner ? $resolver->assignablePeopleIds($this->company) : $resolver->companyMemberIds($this->company))
            ->when($this->notDeactivated, fn ($q) => $q->where('status', '!=', UserStatus::Deactivated))
            ->exists();

        if (! $exists) {
            $fail('validation.exists')->translate();
        }
    }
}
