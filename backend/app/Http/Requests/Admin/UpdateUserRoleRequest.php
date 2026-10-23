<?php

namespace App\Http\Requests\Admin;

use App\Enums\CompanyRole;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class UpdateUserRoleRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('updateRole', [$this->route('user'), $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Роль в компании; Владельца так не назначить — только передачей владения (ADR-0017)
            'role' => ['required', Rule::enum(CompanyRole::class)],
        ];
    }
}
