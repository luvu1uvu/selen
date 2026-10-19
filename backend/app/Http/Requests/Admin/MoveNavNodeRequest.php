<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Boards\NeighbourRules;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Перемещение узла: новый родитель (null — корень) и соседи (ADR-0007). */
class MoveNavNodeRequest extends FormRequest
{
    use NeighbourRules;

    public function authorize(): bool
    {
        return Gate::allows('update', $this->route('node'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'parent_id' => ['present', 'nullable', 'ulid'],
            ...$this->neighbourRules(),
        ];
    }
}
