<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Перестановка доски, колонки или дорожки (структура — только администратор пространства). */
class MoveStructureRequest extends FormRequest
{
    use NeighbourRules;

    public function authorize(): Response
    {
        return Gate::inspect('manage', $this->route('board') ?? $this->route('column') ?? $this->route('lane'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->neighbourRules();
    }
}
