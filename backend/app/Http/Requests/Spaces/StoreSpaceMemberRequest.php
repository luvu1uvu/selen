<?php

namespace App\Http\Requests\Spaces;

use App\Enums\SpaceRole;
use App\Models\Space;
use App\Rules\CompanyMember;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreSpaceMemberRequest extends FormRequest
{
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
            // Только «дом» компании пространства (ADR-0024): человек другой компании — как несуществующий
            'user_id' => ['required', 'ulid', new CompanyMember($this->space()->company_id, withOwner: true)],
            'role' => ['required', Rule::enum(SpaceRole::class)],
        ];
    }
}
