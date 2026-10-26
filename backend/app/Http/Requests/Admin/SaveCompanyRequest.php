<?php

namespace App\Http\Requests\Admin;

use App\Models\Company;
use Closure;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Создание (POST) и переименование (PATCH) компании — только Владелец (ADR-0024). */
class SaveCompanyRequest extends FormRequest
{
    public function authorize(): Response
    {
        $company = $this->company();

        return $company === null ? Gate::inspect('create', Company::class) : Gate::inspect('update', $company);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100', $this->uniqueName(...)],
        ];
    }

    /** Название уникально среди всех компаний без учёта регистра (индекс в БД). */
    private function uniqueName(string $attribute, mixed $value, Closure $fail): void
    {
        $taken = Company::query()
            ->whereRaw('lower(name) = lower(?)', [(string) $value])
            ->when($this->company(), fn ($q, Company $company) => $q->whereKeyNot($company->id))
            ->exists();

        if ($taken) {
            $fail(__('selen.companies.name_taken'));
        }
    }

    private function company(): ?Company
    {
        $company = $this->route('company');

        return $company instanceof Company ? $company : null;
    }
}
