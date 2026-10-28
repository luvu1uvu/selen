<?php

namespace App\Http\Resources;

use App\Models\Comment;
use App\Models\User;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Комментарий. У удалённого нет текста — только пометка (deleted_at). Имена упомянутых — в additional
 * ответа (users: id → имя), см. CommentController. Ожидает загруженные author, card.
 *
 * @mixin Comment
 */
class CommentResource extends JsonResource
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
            // Статус — в компании пространства карточки (П2c)
            'author' => ['id' => $this->author->id, 'name' => $this->author->name, 'status' => CompanyMembers::statusOf($this->author, $this->card->space->company_id)],
            'body' => $this->isDeleted() ? null : $this->body,
            'created_at' => $this->created_at->format('Y-m-d\TH:i:s.u\Z'),
            'edited_at' => $this->edited_at?->toIso8601ZuluString(),
            'deleted_at' => $this->deleted_at?->toIso8601ZuluString(),
            'permissions' => [
                'modify' => ! $this->isDeleted() && $this->author_id === $user->id && ! $this->card->isArchived(),
            ],
        ];
    }
}
