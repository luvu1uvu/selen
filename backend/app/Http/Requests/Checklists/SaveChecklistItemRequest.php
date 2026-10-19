<?php

namespace App\Http\Requests\Checklists;

use App\Models\Checklist;
use App\Models\ChecklistItem;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/**
 * Пункт чек-листа: создание (POST checklists/{checklist}/items), правка текста и отметка
 * (PATCH checklist-items/{item}), перестановка (POST checklist-items/{item}/move — соседи).
 */
class SaveChecklistItemRequest extends FormRequest
{
    public function authorize(): Response
    {
        /** @var ChecklistItem|null $item */
        $item = $this->route('item');
        /** @var Checklist $checklist */
        $checklist = $item !== null ? $item->checklist : $this->route('checklist');

        return Gate::inspect('update', $checklist->card);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->route('item') === null;

        return [
            'text' => [$creating ? 'required' : 'sometimes', 'string', 'max:1000'],
            'is_done' => ['sometimes', 'boolean'],
            'after_id' => ['nullable', 'ulid'],
            'before_id' => ['nullable', 'ulid'],
        ];
    }
}
