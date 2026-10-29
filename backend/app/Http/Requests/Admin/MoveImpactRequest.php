<?php

namespace App\Http\Requests\Admin;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** «Переместить в…»: что изменится в доступе (П2d-1) — новое место узла; без parent_id — корень. */
class MoveImpactRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('node'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'parent_id' => ['nullable', 'ulid'],
        ];
    }

    public function parentId(): ?string
    {
        return $this->validated('parent_id');
    }
}
