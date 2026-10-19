<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/**
 * Передача владения (ADR-0017): только Владелец, с подтверждением своим паролем. Получатель — в адресе.
 */
class TransferOwnershipRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('transferOwnership', $this->route('user'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'password' => ['required', 'string', 'current_password:web'],
        ];
    }
}
