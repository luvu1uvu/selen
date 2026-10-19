<?php

namespace App\Http\Requests\Cards;

use App\Models\CardLink;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Ссылка в карточке: только http и https, необязательное название. */
class SaveCardLinkRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var CardLink|null $link */
        $link = $this->route('link');

        return Gate::inspect('update', $link !== null ? $link->card : $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->route('link') === null ? 'required' : 'sometimes';

        return [
            'url' => [$required, 'string', 'max:2048', 'url:http,https'],
            'title' => ['sometimes', 'nullable', 'string', 'max:200'],
        ];
    }
}
