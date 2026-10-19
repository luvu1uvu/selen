<?php

namespace App\Http\Requests\Admin;

use App\Enums\EventType;
use App\Models\EventLogEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ListEventsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('viewAny', EventLogEntry::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'event_type' => ['nullable', Rule::enum(EventType::class)],
            'actor_id' => ['nullable', 'string', 'max:64'],
            'subject_type' => ['nullable', 'string', 'max:50'],
            'subject_id' => ['nullable', 'string', 'max:64'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
