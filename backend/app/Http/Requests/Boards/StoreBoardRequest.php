<?php

namespace App\Http\Requests\Boards;

use App\Enums\BoardTemplate;
use App\Models\Board;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreBoardRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('create', [Board::class, $this->route('space')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:2000'],
            'template' => ['required', Rule::enum(BoardTemplate::class)],
        ];
    }
}
