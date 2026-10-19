<?php

namespace App\Http\Requests\Cards;

use App\Actions\CardRelations\AddCardRelationAction;
use App\Models\Card;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Связь: вторая карточка — по номеру (DEV-12), kind — кем она приходится текущей. */
class StoreCardRelationRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'card' => ['required', 'string', 'max:30'],
            'kind' => ['required', Rule::in([AddCardRelationAction::KIND_PARENT, AddCardRelationAction::KIND_CHILD])],
        ];
    }

    /** Вторая карточка или null (видимость и пространство проверяет Action). */
    public function relatedCard(): ?Card
    {
        return (new Card)->resolveRouteBinding(strtoupper(trim($this->string('card')->toString())));
    }
}
