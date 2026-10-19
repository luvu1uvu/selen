<?php

namespace App\Http\Requests\Admin;

use App\Enums\UserStatus;
use App\Models\Space;
use App\Rules\Emoji;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreSpaceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('create', Space::class);
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('key'))) {
            $this->merge(['key' => mb_strtoupper(trim($this->input('key')))]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'key' => ['required', 'string', 'regex:/^[A-Z]{2,10}$/', Rule::unique('spaces', 'key')],
            'description' => ['nullable', 'string', 'max:2000'],
            // Иконка-эмодзи в дереве навигации (необязательна)
            'icon' => ['nullable', 'string', 'max:32', new Emoji],
            // Папка в дереве навигации (null — корень); активность проверяет CreateSpaceAction
            'parent_id' => ['nullable', 'ulid'],
            // Администраторы пространства; по умолчанию — сам системный администратор
            'admin_ids' => ['nullable', 'array', 'min:1', 'max:20'],
            'admin_ids.*' => [
                'required', 'ulid', 'distinct',
                Rule::exists('users', 'id')->whereNot('status', UserStatus::Deactivated->value),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['key.regex' => __('selen.spaces.key_format')];
    }
}
