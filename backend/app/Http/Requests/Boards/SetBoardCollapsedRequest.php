<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Личное сворачивание доски: может любой, кто видит доску (BoardPolicy::view, ADR-0019). Тела у запроса нет. */
class SetBoardCollapsedRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('view', $this->route('board'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
