<?php

namespace App\Http\Requests\Spaces;

use App\Enums\SpaceRole;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreSpaceMemberRequest extends FormRequest
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
        return [
            'user_id' => ['required', 'ulid', Rule::exists('users', 'id')],
            'role' => ['required', Rule::enum(SpaceRole::class)],
        ];
    }
}
