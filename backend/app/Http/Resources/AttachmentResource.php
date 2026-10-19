<?php

namespace App\Http\Resources;

use App\Models\Attachment;
use App\Models\User;
use App\Services\Attachments\AttachmentFiles;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * Вложение карточки. Файл — по адресу url (через приложение, с проверкой доступа); для картинок и видео
 * клиент добавляет ?inline=1. Ожидает загруженные uploader, card.
 *
 * @mixin Attachment
 */
class AttachmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $request->user();

        return [
            'id' => $this->id,
            'name' => $this->name,
            // Тип показываем только для безопасных встроенных; остальное — «файл»
            'mime' => isset(AttachmentFiles::INLINE_TYPES[$this->mime]) ? $this->mime : null,
            'size' => $this->size,
            'kind' => $this->kind,
            'url' => "/api/v1/attachments/{$this->id}",
            'uploaded_by' => ['id' => $this->uploader->id, 'name' => $this->uploader->name],
            'created_at' => $this->created_at->format('Y-m-d\TH:i:s.u\Z'),
            'permissions' => ['delete' => Gate::forUser($user)->allows('delete', $this->resource)],
        ];
    }
}
