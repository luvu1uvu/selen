<?php

namespace App\Http\Requests\Boards;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class StoreLaneRequest extends FormRequest
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
        return [
            'name' => ['required', 'string', 'max:100'],
            ...$this->neighbourRules(),
        ];
    }
}
