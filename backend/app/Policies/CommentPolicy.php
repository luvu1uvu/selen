<?php

namespace App\Policies;

use App\Enums\Permission;
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
        $response = $this->allowCard($actor, $comment->card, Permission::CardComment);

        if ($response->allowed() && $comment->author_id !== $actor->id) {
            return Response::deny(__('selen.comments.not_author'));
        }

        return $response;
    }
}
