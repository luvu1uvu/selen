<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use App\Rules\CompanyMember;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Деактивация в компании; successor_id — по желанию, кому передать доступ (активный «дом» этой компании, П2c). */
class DeactivateUserRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('deactivate', [$this->route('user'), $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'successor_id' => ['nullable', 'string', new CompanyMember($this->route('company'), notDeactivated: true)],
        ];
    }

    public function successor(): ?User
    {
        $id = $this->validated('successor_id');

        return $id === null ? null : User::query()->findOrFail($id);
    }
}
