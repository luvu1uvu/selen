<?php

namespace App\Actions\Comments;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Comment;
use App\Models\User;
use App\Services\Cards\MentionSync;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/**
 * Удаление своего комментария — мягкое: строка остаётся («Комментарий удалён»), текст стирается,
 * упоминания из него убираются (решение PM: меньше персональных данных в базе).
 */
class DeleteCommentAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly MentionSync $mentions,
    ) {}

    public function handle(User $actor, Comment $comment): Comment
    {
        return DB::transaction(function () use ($actor, $comment) {
            $comment = Comment::query()->lockForUpdate()->findOrFail($comment->id);
            $this->guard->ensureNotArchived($comment->card);
            $this->guard->ensureCommentNotDeleted($comment);

            $comment->forceFill(['body' => null, 'deleted_at' => Date::now()])->save();

            $this->mentions->sync($comment->card, MentionSync::SOURCE_COMMENT, $comment->id, [], $actor);
            $this->events->record(EventType::CardCommentDeleted, $actor, $comment->card, ['comment_id' => $comment->id]);

            return $comment;
        });
    }
}
