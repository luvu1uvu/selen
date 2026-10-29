<?php

namespace App\Http\Requests\Spaces;

use App\Http\Requests\Concerns\ValidatesRoles;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class UpdateSpaceGroupRequest extends FormRequest
{
    use ValidatesRoles;

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
            // Набор ролей группы на пространстве целиком (П2d-1)
            ...$this->roleRules(),
        ];
    }
}
