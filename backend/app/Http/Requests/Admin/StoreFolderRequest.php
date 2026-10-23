<?php

namespace App\Http\Requests\Admin;

use App\Models\NavNode;
use App\Rules\Emoji;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class StoreFolderRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manage', [NavNode::class, $this->route('company')]);
    }

    protected function prepareForValidation(): void
    {
        $this->merge(NavNodeInput::normalize($this->all()));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'icon' => ['nullable', 'string', 'max:32', new Emoji],
            // null — корень; что это активная папка, проверяет Action
            'parent_id' => ['nullable', 'ulid'],
        ];
    }
}
