<?php

namespace App\Policies;

use App\Enums\SpaceRole;
use App\Models\Comment;
use App\Models\User;
use App\Policies\Concerns\ChecksSpaceRole;
use Illuminate\Auth\Access\Response;

/** Свой комментарий можно изменить и удалить; чужой — нет (403). Невидимая карточка — 404. */
class CommentPolicy
{
    use ChecksSpaceRole;

    public function modify(User $actor, Comment $comment): Response
    {
        $response = $this->allowCard($actor, $comment->card, fn (SpaceRole $role) => true);

        if ($response->allowed() && $comment->author_id !== $actor->id) {
            return Response::deny(__('selen.comments.not_author'));
        }

        return $response;
    }
}
