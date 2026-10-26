<?php

namespace App\Http\Requests\Admin;

use App\Models\Space;
use App\Rules\CompanyMember;
use App\Rules\Emoji;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreSpaceRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('create', [Space::class, $this->route('company')]);
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
            // Администраторы пространства — люди этой компании; по умолчанию — сам администратор компании
            'admin_ids' => ['nullable', 'array', 'min:1', 'max:20'],
            'admin_ids.*' => ['required', 'ulid', 'distinct', new CompanyMember($this->route('company'), notDeactivated: true, withOwner: true)],
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
