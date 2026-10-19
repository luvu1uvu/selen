<?php

namespace App\Http\Requests\Admin;

use App\Enums\SpaceRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class AssignSpaceRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('assignRole', $this->route('space'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(SpaceRole::class)],
        ];
    }
}
