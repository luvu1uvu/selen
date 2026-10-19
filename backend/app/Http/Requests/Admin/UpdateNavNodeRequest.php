<?php

namespace App\Http\Requests\Admin;

use App\Rules\Emoji;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Название папки и/или иконка папки или пространства. */
class UpdateNavNodeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('update', $this->route('node'));
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
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'icon' => ['sometimes', 'nullable', 'string', 'max:32', new Emoji],
        ];
    }
}
