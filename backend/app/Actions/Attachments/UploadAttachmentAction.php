<?php

namespace App\Actions\Attachments;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Attachment;
use App\Models\Card;
use App\Models\User;
use App\Services\Attachments\AttachmentFiles;
use App\Services\EventLog\EventRecorder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Загрузка вложения. Прикладывать файлы могут все роли пространства, включая commenter
 * (картинки в комментариях — решение PM). Файл пишется до транзакции; если запись в БД не удалась —
 * файл удаляется, чтобы на диске не оставалось «сирот».
 */
class UploadAttachmentAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly AttachmentFiles $files,
    ) {}

    public function handle(User $actor, Card $card, UploadedFile $file): Attachment
    {
        $this->guard->ensureNotArchived($card);
        $stored = $this->files->store($file, $card->id);

        try {
            return DB::transaction(function () use ($actor, $card, $stored) {
                $attachment = new Attachment;
                $attachment->forceFill($stored + ['card_id' => $card->id, 'uploaded_by' => $actor->id])->save();

                $this->events->record(EventType::CardAttachmentAdded, $actor, $card, [
                    'attachment_id' => $attachment->id,
                    'kind' => $attachment->kind,
                ]);

                return $attachment;
            });
        } catch (Throwable $e) {
            Storage::disk($stored['disk'])->delete($stored['path']);

            throw $e;
        }
    }
}
