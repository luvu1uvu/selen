<?php

namespace App\Http\Requests\Admin;

use App\Enums\SpaceRole;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Доступ группы к пространству со страницы группы в админке. */
class AssignSpaceGroupRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manageSpaces', $this->route('group'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(SpaceRole::class)],
            'own_cards_only' => ['sometimes', 'boolean'],
        ];
    }
}
