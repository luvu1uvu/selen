<?php

namespace App\Http\Requests\Admin;

use App\Models\Company;
use App\Models\Group;
use Closure;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Создание (POST) и изменение (PATCH) группы. */
class SaveGroupRequest extends FormRequest
{
    public function authorize(): Response
    {
        $group = $this->group();

        return $group === null ? Gate::inspect('create', [Group::class, $this->route('company')]) : Gate::inspect('update', $group);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->group() === null ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:100', $this->uniqueName(...)],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];
    }

    /** Название уникально среди групп компании, включая архивные, без учёта регистра (индекс в БД). */
    private function uniqueName(string $attribute, mixed $value, Closure $fail): void
    {
        /** @var Company $company */
        $company = $this->route('company');

        $taken = Group::query()
            ->inCompany($company)
            ->whereRaw('lower(name) = lower(?)', [(string) $value])
            ->when($this->group(), fn ($q, Group $group) => $q->whereKeyNot($group->id))
            ->exists();

        if ($taken) {
            $fail(__('selen.groups.name_taken'));
        }
    }

    private function group(): ?Group
    {
        $group = $this->route('group');

        return $group instanceof Group ? $group : null;
    }
}
