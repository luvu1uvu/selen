<?php

namespace App\Http\Requests\Admin;

use App\Enums\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class UpdateUserRoleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('updateRole', $this->route('user'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Роль Владельца — только передачей владения (ADR-0017)
            'role' => ['required', Rule::enum(UserRole::class)->only(UserRole::ASSIGNABLE)],
        ];
    }
}
