<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Личное сворачивание дорожки: может любой, кто видит доску (LanePolicy::view, ADR-0019). Тела у запроса нет. */
class SetLaneCollapsedRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('view', $this->route('lane'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
