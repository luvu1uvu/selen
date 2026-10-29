<?php

namespace App\Http\Requests\Admin;

use App\Enums\EventType;
use App\Models\EventLogEntry;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ListEventsRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('viewAny', [EventLogEntry::class, $this->route('company')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'event_type' => ['nullable', Rule::enum(EventType::class)],
            'actor_id' => ['nullable', 'string', 'max:64'],
            // Человек — автор или объект события (П2c-2)
            'user_id' => ['nullable', 'string', 'max:64'],
            'subject_type' => ['nullable', 'string', 'max:50'],
            'subject_id' => ['nullable', 'string', 'max:64'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
