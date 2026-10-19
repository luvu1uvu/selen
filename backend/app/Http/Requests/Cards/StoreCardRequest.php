<?php

namespace App\Http\Requests\Cards;

use App\Models\Board;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreCardRequest extends FormRequest
{
    use CardPlacementRules;

    public function authorize(): Response
    {
        return Gate::inspect('createCard', $this->route('board'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Board $board */
        $board = $this->route('board');

        return [
            'title' => ['required', 'string', 'max:500'],
            'card_type_id' => ['nullable', 'ulid', Rule::exists('card_types', 'id')->whereNull('archived_at')],
            ...$this->cellRules($board->id),
        ];
    }
}
