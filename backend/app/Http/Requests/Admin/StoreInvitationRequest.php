<?php

namespace App\Http\Requests\Admin;

use App\Enums\UserRole;
use App\Models\Invitation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreInvitationRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Роль admin в приглашении — только Владелец (ADR-0017); неверная роль — 422 из правил ниже.
        // Не enum(): до валидации в role может прийти не строка (массив), а tryFrom() примет только строку
        $role = $this->input('role');

        return Gate::allows('create', [Invitation::class, is_string($role) ? UserRole::tryFrom($role) : null]);
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => mb_strtolower(trim((string) $this->input('email')))]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            // Владелец не приглашается — только передача владения
            'role' => ['required', Rule::enum(UserRole::class)->only(UserRole::ASSIGNABLE)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'email.unique' => __('selen.invitations.email_taken'),
        ];
    }
}
