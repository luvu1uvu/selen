<?php

namespace App\Http\Requests\Admin;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Смена email администратором (П2c-2, LATER-9): новый адрес; занятость и прочие ограничения — в Action (под блокировкой). */
class ChangeUserEmailRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('changeEmail', [$this->route('user'), $this->route('company')]);
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
        ];
    }
}
