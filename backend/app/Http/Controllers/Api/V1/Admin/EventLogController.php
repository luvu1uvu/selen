<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ListEventsRequest;
use App\Http\Resources\EventLogEntryResource;
use App\Models\Company;
use App\Models\EventLogEntry;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Журнал событий компании (ADR-0024; решение PM 23.10): события компании и события без компании «о человеке»
 * (объект — пользователь: вход, смена пароля, передача владения, отключение учётной записи) — о её людях
 * (AccessResolver::eventsAboutPeople: убранный из компании, но работающий в другой, — нет; ушедший отовсюду — до
 * того, как его убрали). Системные события без человека
 * (неудачный вход с неизвестным email, позже — создание компании) — только Владельцу.
 */
class EventLogController extends Controller
{
    public function index(ListEventsRequest $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        /** @var User $actor */
        $actor = $request->user();
        $user = (new User)->getMorphClass();

        $entries = EventLogEntry::query()
            ->where(fn (Builder $q) => $q
                ->where('company_id', $company->id)
                ->orWhere(fn (Builder $q) => $resolver->eventsAboutPeople($q
                    ->whereNull('company_id')
                    ->where('subject_type', $user), $company))
                ->when($actor->isOwner(), fn (Builder $q) => $q->orWhere(fn (Builder $q) => $q
                    ->whereNull('company_id')
                    ->where(fn (Builder $q) => $q->whereNull('subject_type')->orWhere('subject_type', '!=', $user)))))
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
