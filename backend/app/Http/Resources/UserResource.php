<?php

namespace App\Http\Resources;

use App\Enums\CompanyRole;
use App\Enums\UserRole;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Текущий пользователь (/auth/me, вход, профиль). role — для интерфейса (ADR-0024): owner; admin — администратор хотя
 * бы одной компании; иначе member. admin_companies — компании, которыми он управляет (Владелец — всеми): адреса
 * админки admin/companies/{id} (frontend — adminCompanies; одна компания — интерфейс как раньше).
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
        $adminCompanies = app(AccessResolver::class)->adminCompanyIds($this->resource);

        return $this->account(match (true) {
            $this->resource->isOwner() => UserRole::Owner->value,
            $adminCompanies->isNotEmpty() => CompanyRole::Admin->value,
            default => CompanyRole::Member->value,
        }) + [
            'admin_companies' => $adminCompanies->map(fn (string $id) => ['id' => $id])->values()->all(),
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
