<?php

namespace App\Http\Requests\Admin;

use App\Models\Group;
use App\Rules\CompanyMember;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class StoreGroupMemberRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->group());
    }

    private function group(): Group
    {
        /** @var Group */
        return $this->route('group');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Состав группы — только «дома» её компании (ADR-0024)
            'user_id' => ['required', 'ulid', new CompanyMember($this->group()->company_id)],
        ];
    }
}
