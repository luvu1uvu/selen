<?php

namespace App\Http\Requests\Admin;

use App\Models\CardType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Создание (POST) и изменение (PATCH) типа карточки. */
class SaveCardTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('manage', CardType::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var CardType|null $type */
        $type = $this->route('cardType');
        $required = $type === null ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:50', Rule::unique('card_types', 'name')->ignore($type)],
            'color' => [$required, 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
