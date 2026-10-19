<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ListEventsRequest;
use App\Http\Resources\EventLogEntryResource;
use App\Models\EventLogEntry;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class EventLogController extends Controller
{
    public function index(ListEventsRequest $request): AnonymousResourceCollection
    {
        $entries = EventLogEntry::query()
            ->with(['actor', 'authAudit'])
            ->when($request->validated('event_type'), fn ($q, $type) => $q->where('event_type', $type))
            ->when($request->validated('actor_id'), fn ($q, $id) => $q->where('actor_id', $id))
            ->when($request->validated('subject_type'), fn ($q, $type) => $q->where('subject_type', $type))
            ->when($request->validated('subject_id'), fn ($q, $id) => $q->where('subject_id', $id))
            ->orderByDesc('id')
            ->paginate(50);

        return EventLogEntryResource::collection($entries);
    }
}
