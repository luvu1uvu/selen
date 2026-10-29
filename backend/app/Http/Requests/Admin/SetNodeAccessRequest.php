<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\ValidatesRoles;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Роли человека или группы на узле дерева из «Доступа…» (П2d-1): набор ролей целиком. */
class SetNodeAccessRequest extends FormRequest
{
    use ValidatesRoles;

    public function authorize(): Response
    {
        return Gate::inspect('manageAccess', $this->route('node'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->roleRules();
    }
}
