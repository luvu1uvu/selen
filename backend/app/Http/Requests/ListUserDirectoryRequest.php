<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class ListUserDirectoryRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('viewDirectory', [User::class, $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            // Только «дома» компании — выбор в состав группы (Владельца без «дома» в группу не добавить, ADR-0024)
            'homes' => ['nullable', 'boolean'],
        ];
    }
}
