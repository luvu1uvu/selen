<?php

namespace App\Policies;

use App\Enums\Permission;
use App\Models\Attachment;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/**
 * Вложения: скачивают все, кто видит карточку; удаляет загрузивший, editor или admin пространства.
 * Удалённое вложение не отдаётся (404).
 */
class AttachmentPolicy
{
    use ChecksSpaceRole;

    public function view(User $actor, Attachment $attachment): Response
    {
        if ($attachment->isDeleted()) {
            return Response::denyAsNotFound();
        }

        return $this->allowCard($actor, $attachment->card);
    }

    public function delete(User $actor, Attachment $attachment): Response
    {
        // Свой файл удаляет тот, кто может прикладывать файлы; чужой — тот, кто редактирует карточку
        $isUploader = $attachment->uploaded_by === $actor->id;

        return $this->allowCard($actor, $attachment->card, $isUploader ? Permission::CardComment : Permission::CardUpdate);
    }
}
