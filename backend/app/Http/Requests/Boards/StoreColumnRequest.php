<?php

namespace App\Http\Requests\Boards;

use App\Enums\ColumnCategory;
use App\Models\Board;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreColumnRequest extends FormRequest
{
    use NeighbourRules;

    public function authorize(): Response
    {
        return Gate::inspect('manage', $this->route('board'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Board $board */
        $board = $this->route('board');

        return [
            'name' => ['required', 'string', 'max:100'],
            // Тип обязателен у колонки первого уровня и запрещён у подколонки (проверяет Action)
            'category' => ['nullable', Rule::enum(ColumnCategory::class)],
            // Родитель — активная колонка первого уровня этой же доски
            'parent_id' => [
                'nullable', 'ulid',
                Rule::exists('board_columns', 'id')->where('board_id', $board->id)->whereNull('archived_at')->whereNull('parent_id'),
            ],
            ...$this->neighbourRules(),
        ];
    }
}
