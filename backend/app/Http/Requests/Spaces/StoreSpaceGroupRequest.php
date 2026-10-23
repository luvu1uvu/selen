<?php

namespace App\Http\Requests\Spaces;

use App\Enums\SpaceRole;
use App\Models\Space;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreSpaceGroupRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manageMembers', $this->route('space'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Space $space */
        $space = $this->route('space');

        return [
            // Только группа компании пространства (ADR-0024): группа другой компании — как несуществующая
            'group_id' => ['required', 'ulid', Rule::exists('groups', 'id')->where('company_id', $space->company_id)],
            'role' => ['required', Rule::enum(SpaceRole::class)],
            'own_cards_only' => ['sometimes', 'boolean'],
        ];
    }
}
