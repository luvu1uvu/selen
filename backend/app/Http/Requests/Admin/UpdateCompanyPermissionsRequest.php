<?php

namespace App\Http\Requests\Admin;

use App\Enums\Permission;
use App\Models\Group;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * «Права компании» человека или группы (П2c): итоговый набор выданных лично прав. Только выдаваемые права
 * (Permission::grantable); какие из них может менять автор — SetCompanyPermissionsAction (422).
 */
class UpdateCompanyPermissionsRequest extends FormRequest
{
    public function authorize(): Response
    {
        $group = $this->route('group');

        return $group instanceof Group
            ? Gate::inspect('managePermissions', $group)
            : Gate::inspect('managePermissions', [$this->route('user'), $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(array_map(fn (Permission $p) => $p->value, Permission::grantable()))],
        ];
    }

    /** @return list<Permission> */
    public function permissions(): array
    {
        return array_map(fn (string $value) => Permission::from($value), (array) $this->validated('permissions', []));
    }
}
