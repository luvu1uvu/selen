<?php

namespace App\Http\Requests\Admin;

use App\Enums\SpaceRole;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class AssignSpaceRoleRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('assignRole', $this->route('space'));
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
