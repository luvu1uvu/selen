<?php

namespace App\Http\Resources;

use App\Enums\CompanyRole;
use App\Enums\UserRole;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Текущий пользователь (/auth/me, вход, профиль). role — для интерфейса (ADR-0024): owner; admin — администратор хотя
 * бы одной компании; иначе member. admin_companies — компании, которыми он управляет (Владелец — всеми), по дате
 * создания: адреса админки /admin/c/{id}, права компании — пункты меню (frontend — adminCompanies). Название — только
 * если их несколько (выбор компании): у кого компания одна, названий компаний нигде нет (решение PM 23.10, вопрос 5).
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $ids = app(AccessResolver::class)->adminCompanyIds($this->resource);
        $companies = $ids->isEmpty() ? collect() : Company::query()->whereKey($ids->all())->get()
            ->sortBy(fn (Company $company) => $ids->search($company->id));
        $named = $companies->count() > 1;

        return $this->account(match (true) {
            $this->resource->isOwner() => UserRole::Owner->value,
            $companies->isNotEmpty() => CompanyRole::Admin->value,
            default => CompanyRole::Member->value,
        }) + [
            'admin_companies' => $companies
                ->map(fn (Company $company) => [
                    'id' => $company->id,
                    'name' => $named ? $company->name : null,
                    'permissions' => $company->permissionsOf($this->resource)->permissions(),
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * Поля учётной записи с ролью для показа (общие с AdminUserResource).
     *
     * @return array<string, mixed>
     */
    protected function account(string $role): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $role,
            'status' => $this->status,
            'timezone' => $this->timezone,
            'last_login_at' => $this->last_login_at?->toIso8601ZuluString(),
            'deactivated_at' => $this->deactivated_at?->toIso8601ZuluString(),
            'created_at' => $this->created_at->toIso8601ZuluString(),
            // Только в админских списках (загружается явно)
            'invitation' => $this->whenLoaded('latestInvitation', fn () => $this->latestInvitation === null ? null : [
                'id' => $this->latestInvitation->id,
                'state' => $this->latestInvitation->state(),
                'expires_at' => $this->latestInvitation->expires_at->toIso8601ZuluString(),
            ]),
        ];
    }
}
