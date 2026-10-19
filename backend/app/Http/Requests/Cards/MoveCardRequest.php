<?php

namespace App\Http\Requests\Cards;

use App\Models\Card;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Перемещение карточки. Целевая доска — только активная доска того же пространства:
 * перенос между пространствами вне scope (чужая доска даёт 422, как несуществующая).
 */
class MoveCardRequest extends FormRequest
{
    use CardPlacementRules;

    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Card $card */
        $card = $this->route('card');
        $boardId = $this->input('board_id');

        return [
            'board_id' => [
                'nullable', 'ulid',
                Rule::exists('boards', 'id')->where('space_id', $card->space_id)->whereNull('archived_at'),
            ],
            ...$this->cellRules(is_string($boardId) && $boardId !== '' ? $boardId : $card->board_id),
        ];
    }
}
