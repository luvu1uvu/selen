<?php

namespace App\Http\Requests\Spaces;

use App\Http\Requests\Concerns\ValidatesRoles;
use App\Models\Space;
use App\Rules\CompanyMember;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class StoreSpaceMemberRequest extends FormRequest
{
    use ValidatesRoles;

    public function authorize(): Response
    {
        return Gate::inspect('manageMembers', $this->space());
    }

    private function space(): Space
    {
        /** @var Space */
        return $this->route('space');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // «Дом» компании пространства или Владелец — участник всех компаний (ADR-0024): человек другой компании —
            // как несуществующий
            'user_id' => ['required', 'ulid', new CompanyMember($this->space()->company_id, withOwner: true)],
            // Несколько ролей (П2d-1)
            ...$this->roleRules(),
        ];
    }
}
