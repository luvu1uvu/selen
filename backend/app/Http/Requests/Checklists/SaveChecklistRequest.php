<?php

namespace App\Http\Requests\Checklists;

use App\Models\Checklist;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Новый чек-лист (POST cards/{card}/checklists) или переименование (PATCH checklists/{checklist}). */
class SaveChecklistRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var Checklist|null $checklist */
        $checklist = $this->route('checklist');

        return Gate::inspect('update', $checklist !== null ? $checklist->card : $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['title' => ['required', 'string', 'max:200']];
    }
}
