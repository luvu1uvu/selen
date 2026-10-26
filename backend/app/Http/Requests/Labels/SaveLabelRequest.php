<?php

namespace App\Http\Requests\Labels;

use App\Models\Company;
use App\Models\Label;
use App\Models\Space;
use Closure;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/**
 * Создание (POST admin/labels, POST spaces/{KEY}/labels) и изменение (PATCH labels/{id}) метки.
 * Название уникально среди активных меток своего набора без учёта регистра.
 */
class SaveLabelRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var Label|null $label */
        $label = $this->route('label');
        /** @var Space|null $space */
        $space = $this->route('space');

        return match (true) {
            $label !== null => Gate::inspect('manage', $label),
            $space !== null => Gate::inspect('createLabel', $space),
            default => Gate::inspect('manageCompanyLabels', [Label::class, $this->route('company')]),
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Label|null $label */
        $label = $this->route('label');
        /** @var Space|null $space */
        $space = $this->route('space');
        $spaceId = $label !== null ? $label->space_id : $space?->id;
        /** @var Company|null $company */
        $company = $this->route('company');
        // Набор меток — в компании: метки пространства или общие метки компании (ADR-0024)
        $companyId = $label->company_id ?? $space->company_id ?? $company?->id;
        $required = $label === null ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:50', function (string $attribute, mixed $value, Closure $fail) use ($label, $spaceId, $companyId) {
                $taken = Label::query()
                    ->active()
                    ->when($companyId !== null, fn ($q) => $q->inCompany($companyId))
                    ->when($label, fn ($q) => $q->whereKeyNot($label->id))
                    ->where(fn ($q) => $spaceId === null ? $q->whereNull('space_id') : $q->where('space_id', $spaceId))
                    ->whereRaw('lower(name) = lower(?)', [(string) $value])
                    ->exists();

                if ($taken) {
                    $fail(__('selen.labels.name_taken'));
                }
            }],
            'color' => [$required, 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ];
    }
}
