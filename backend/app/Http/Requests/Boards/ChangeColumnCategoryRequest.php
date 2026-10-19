<?php

namespace App\Http\Requests\Boards;

use App\Enums\ColumnCategory;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ChangeColumnCategoryRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manage', $this->route('column'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'category' => ['required', Rule::enum(ColumnCategory::class)],
        ];
    }
}
