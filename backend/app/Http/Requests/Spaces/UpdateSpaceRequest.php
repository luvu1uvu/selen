<?php

namespace App\Http\Requests\Spaces;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class UpdateSpaceRequest extends FormRequest
{
    /** Response, а не bool: чужое пространство — 404 до валидации, недостаток прав — 403. */
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('space'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
