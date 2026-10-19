<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Переименование колонки или дорожки. */
class RenameStructureRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manage', $this->route('column') ?? $this->route('lane'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
        ];
    }
}
