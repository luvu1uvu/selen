<?php

namespace App\Http\Resources;

use App\Models\EventLogEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin EventLogEntry
 */
class EventLogEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'event_type' => $this->event_type,
            'occurred_at' => $this->occurred_at->format('Y-m-d\TH:i:s.u\Z'),
            'actor' => $this->actor === null ? null : ['id' => $this->actor->id, 'name' => $this->actor->name],
            'subject_type' => $this->subject_type,
            'subject_id' => $this->subject_id,
            'payload' => (object) $this->payload,
            'meta' => (object) $this->meta,
            'auth_audit' => $this->authAudit === null ? null : [
                'ip' => $this->authAudit->ip,
                'user_agent' => $this->authAudit->user_agent,
            ],
        ];
    }
}
