<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ListUsersRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('viewAny', [User::class, $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Статус в компании (AccessResolver::companyPeopleIdsIn): active | invited | deactivated | guest
            'status' => ['nullable', Rule::in(['active', 'invited', 'deactivated', 'guest'])],
            'search' => ['nullable', 'string', 'max:100'],
            // Сортировка (П2c-2): по имени (по умолчанию) или по «последней активности» — last_seen (раньше — давние),
            // -last_seen (сначала недавние)
            'sort' => ['nullable', Rule::in(['name', 'last_seen', '-last_seen'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }

    public function sortsByLastSeen(): bool
    {
        return in_array($this->validated('sort'), ['last_seen', '-last_seen'], true);
    }

    /** Направление сортировки по «последней активности» — для ORDER BY (только эти два значения). */
    public function sortDirection(): string
    {
        return $this->validated('sort') === '-last_seen' ? 'DESC' : 'ASC';
    }
}
