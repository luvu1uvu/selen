<?php

namespace App\Http\Requests\Admin;

use App\Enums\CompanyRole;
use App\Enums\SpaceRole;
use App\Http\Requests\Admin\Concerns\ValidatesSpaceGrants;
use App\Models\Invitation;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Приглашение в компанию: имя, email, роль в компании и сразу — доступ к пространствам (П2c). Email существующей
 * учётной записи — не ошибка: она сразу получает «дом» (InviteUserAction, В8).
 */
class StoreInvitationRequest extends FormRequest
{
    use ValidatesSpaceGrants;

    public function authorize(): Response
    {
        // Роль admin в приглашении — только Владелец (ADR-0017); неверная роль — 422 из правил ниже.
        // Не enum(): до валидации в role может прийти не строка (массив), а tryFrom() примет только строку
        $role = $this->input('role');

        return Gate::inspect('create', [Invitation::class, $this->route('company'), is_string($role) ? CompanyRole::tryFrom($role) : null]);
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
            'email' => ['required', 'string', 'email', 'max:255'],
            // Владелец не приглашается — только передача владения
            'role' => ['required', Rule::enum(CompanyRole::class)],
            ...$this->spaceGrantRules(SpaceRole::cases()),
        ];
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [fn (Validator $validator) => $validator->errors()->isEmpty() ? $this->validateSpaceGrants($validator) : null];
    }
}
