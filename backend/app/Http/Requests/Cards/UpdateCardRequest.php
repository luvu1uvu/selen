<?php

namespace App\Http\Requests\Cards;

use App\Http\Requests\Concerns\KeepsRawRichText;
use App\Models\Card;
use App\Rules\AssignableMember;
use App\Rules\RichText;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Изменение полей карточки (PATCH: только переданные поля).
 * Срок — либо due_date (дата без времени), либо due_at (момент, ISO 8601); новое значение заменяет другое.
 */
class UpdateCardRequest extends FormRequest
{
    use KeepsRawRichText;

    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    protected function prepareForValidation(): void
    {
        $this->restoreRawRichText('description');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Card $card */
        $card = $this->route('card');

        return [
            'title' => ['sometimes', 'required', 'string', 'max:500'],
            // Документ визуального редактора (ADR-0009); упомянуть можно только видящих карточку
            'description' => ['sometimes', 'nullable', 'array', new RichText($card, $card->description)],
            'card_type_id' => ['sometimes', 'required', 'ulid', Rule::exists('card_types', 'id')->whereNull('archived_at')],
            'customer_id' => ['sometimes', 'required', 'ulid', new AssignableMember($card->space, $card->customer_id)],
            'responsible_id' => ['sometimes', 'nullable', 'ulid', new AssignableMember($card->space, $card->responsible_id)],
            'due_date' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'prohibits:due_at'],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'is_urgent' => ['sometimes', 'boolean'],
            'estimate_hours' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999.5', 'multiple_of:0.5'],
        ];
    }
}
