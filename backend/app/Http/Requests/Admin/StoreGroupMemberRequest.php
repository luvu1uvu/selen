<?php

namespace App\Http\Requests\Admin;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreGroupMemberRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('group'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'ulid', Rule::exists('users', 'id')],
        ];
    }
}
