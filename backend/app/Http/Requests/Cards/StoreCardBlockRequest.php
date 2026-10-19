<?php

namespace App\Http\Requests\Cards;

use App\Models\Card;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Блокировка: текст причины и/или блокирующая карточка по номеру (DEV-12). */
class StoreCardBlockRequest extends FormRequest
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
            'reason' => ['nullable', 'string', 'max:1000'],
            'blocking_card' => ['nullable', 'string', 'max:30'],
        ];
    }

    public function byCard(): bool
    {
        return $this->filled('blocking_card');
    }

    public function blockingCard(): ?Card
    {
        return $this->byCard()
            ? (new Card)->resolveRouteBinding(strtoupper(trim($this->string('blocking_card')->toString())))
            : null;
    }
}
