<?php

namespace App\Http\Resources;

use App\Models\Company;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Компания на экране Владельца «Компании» (ADR-0024): сколько в ней людей («дома» без деактивированных) и кто её
 * администраторы — их готовит CompanyController (AccessResolver::companiesSummary) в атрибутах people_count и admins.
 *
 * @mixin Company
 */
class CompanyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var iterable<User> $admins */
        $admins = $this->resource->getAttribute('admins') ?? [];

        return [
            'id' => $this->id,
            'name' => $this->name,
            'created_at' => $this->created_at->toIso8601ZuluString(),
            'people_count' => (int) $this->resource->getAttribute('people_count'),
            'admins' => collect($admins)
                ->map(fn (User $admin) => ['id' => $admin->id, 'name' => $admin->name, 'email' => $admin->email, 'status' => $admin->status])
                ->values()
                ->all(),
        ];
    }
}
