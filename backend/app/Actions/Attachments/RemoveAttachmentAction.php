<?php

namespace App\Actions\Attachments;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Attachment;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Удаление вложения — мягкое: из карточки пропадает сразу, файл стирается через
 * Attachment::PURGE_AFTER_DAYS (model:prune). Удалить может загрузивший, editor и admin.
 */
class RemoveAttachmentAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
    ) {}

    public function handle(User $actor, Attachment $attachment): void
    {
        DB::transaction(function () use ($actor, $attachment) {
            $attachment = Attachment::query()->lockForUpdate()->findOrFail($attachment->id);
            $this->guard->ensureNotArchived($attachment->card);

            if ($attachment->isDeleted()) {
                throw ValidationException::withMessages(['attachment' => __('selen.attachments.deleted')]);
            }

            $attachment->forceFill(['deleted_at' => Date::now(), 'deleted_by' => $actor->id])->save();
            $this->events->record(EventType::CardAttachmentRemoved, $actor, $attachment->card, ['attachment_id' => $attachment->id]);
        });
    }
}
