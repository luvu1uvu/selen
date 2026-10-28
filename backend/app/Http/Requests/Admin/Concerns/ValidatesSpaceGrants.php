<?php

namespace App\Http\Requests\Admin\Concerns;

use App\Actions\Spaces\GrantableSpaces;
use App\Enums\SpaceRole;
use App\Models\Company;
use App\Models\Space;
use App\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Доступ к пространствам в приглашении и у гостя (П2c): spaces — [{space_id, role, own_cards_only?}]. Пространство —
 * этой компании, не в архиве, и автор может выдавать в нём доступ (GrantableSpaces); иначе — 422 «не найдено», как
 * несуществующее (пространство другой компании неотличимо). Гостю — роли без «управления доступом».
 */
trait ValidatesSpaceGrants
{
    /**
     * @param  list<SpaceRole>  $roles
     * @return array<string, mixed>
     */
    protected function spaceGrantRules(array $roles): array
    {
        return [
            'spaces' => ['sometimes', 'array', 'max:50'],
            'spaces.*' => ['array:space_id,role,own_cards_only'],
            'spaces.*.space_id' => ['required', 'string', 'distinct'],
            'spaces.*.role' => ['required', Rule::in(array_map(fn (SpaceRole $role) => $role->value, $roles))],
            'spaces.*.own_cards_only' => ['sometimes', 'boolean'],
        ];
    }

    protected function validateSpaceGrants(Validator $validator): void
    {
        /** @var Company $company */
        $company = $this->route('company');
        /** @var User $actor */
        $actor = $this->user();
        $grantable = app(GrantableSpaces::class);

        foreach ((array) $this->input('spaces', []) as $index => $grant) {
            $id = is_array($grant) ? ($grant['space_id'] ?? null) : null;
            $space = is_string($id) ? Space::query()->inCompany($company)->find($id) : null;
            if ($space === null || ! $grantable->allows($actor, $space, $company)) {
                $validator->errors()->add("spaces.{$index}.space_id", __('selen.spaces.not_found'));
            }
        }
    }

    /**
     * Выдачи из запроса: пространства и роли (после валидации).
     *
     * @return list<array{space: Space, role: SpaceRole, own_cards_only: bool}>
     */
    public function spaceGrants(): array
    {
        /** @var Company $company */
        $company = $this->route('company');
        $grants = [];
        foreach ((array) $this->validated('spaces', []) as $grant) {
            $grants[] = [
                'space' => Space::query()->inCompany($company)->findOrFail($grant['space_id']),
                'role' => SpaceRole::from($grant['role']),
                'own_cards_only' => (bool) ($grant['own_cards_only'] ?? false),
            ];
        }

        return $grants;
    }
}
