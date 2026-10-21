<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

/**
 * Перестановка доски в раскладке пространства (ADR-0019) — только администратор пространства (BoardPolicy::manage).
 * Три вида запроса:
 * - row_id + after_id/before_id — в этот ряд между соседями-досками;
 * - new_row_after_id/new_row_before_id (хотя бы одно поле, можно null) — отдельным новым рядом между рядами;
 * - только after_id/before_id (как до рядов) — в ряд соседа, рядом с ним.
 */
class MoveBoardRequest extends FormRequest
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
        return $this->neighbourRules() + [
            'row_id' => ['nullable', 'ulid'],
            'new_row_after_id' => ['nullable', 'ulid'],
            'new_row_before_id' => ['nullable', 'ulid'],
        ];
    }

    /**
     * Ряд и новый ряд вместе — 422: правило prohibits считает поле со значением null отсутствующим, а new_row_* со
     * значением null — уже запрос «новым рядом».
     *
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            if ($this->exists('row_id') && $this->wantsNewRow()) {
                $validator->errors()->add('row_id', __('validation.prohibits', ['attribute' => 'row_id', 'other' => 'new_row_after_id, new_row_before_id']));
            }
        }];
    }

    /** Отдельным новым рядом: в запросе есть хотя бы одно из полей new_row_* (даже null — тогда ряд в конце). */
    public function wantsNewRow(): bool
    {
        return $this->exists('new_row_after_id') || $this->exists('new_row_before_id');
    }
}
