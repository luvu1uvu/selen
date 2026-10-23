<?php

namespace App\Http\Requests\Admin;

use App\Models\CardType;
use App\Models\Company;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Создание (POST) и изменение (PATCH) типа карточки. */
class SaveCardTypeRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('manage', [CardType::class, $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var CardType|null $type */
        $type = $this->route('cardType');
        $required = $type === null ? 'required' : 'sometimes';

        /** @var Company $company */
        $company = $this->route('company');

        return [
            // Название уникально в компании
            'name' => [$required, 'string', 'max:50', Rule::unique('card_types', 'name')->where('company_id', $company->id)->ignore($type)],
            'color' => [$required, 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
