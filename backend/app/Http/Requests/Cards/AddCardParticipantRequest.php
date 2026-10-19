<?php

namespace App\Http\Requests\Cards;

use App\Models\Card;
use App\Rules\AssignableMember;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class AddCardParticipantRequest extends FormRequest
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
        /** @var Card $card */
        $card = $this->route('card');

        return [
            'user_id' => ['required', 'ulid', new AssignableMember($card->space)],
        ];
    }
}
