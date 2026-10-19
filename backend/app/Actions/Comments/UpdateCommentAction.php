<?php

namespace App\Actions\Comments;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Comment;
use App\Models\User;
use App\Services\Cards\MentionSync;
use App\Services\EventLog\EventRecorder;
use App\Support\RichText\RichTextDocument;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/** Правка своего комментария: пометка «изменено» (edited_at), упоминания синхронизируются. */
class UpdateCommentAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly MentionSync $mentions,
    ) {}

    /**
     * @param  array<mixed>  $body
     */
    public function handle(User $actor, Comment $comment, array $body): Comment
    {
        return DB::transaction(function () use ($actor, $comment, $body) {
            $comment = Comment::query()->lockForUpdate()->findOrFail($comment->id);
            $this->guard->ensureNotArchived($comment->card);
            $this->guard->ensureCommentNotDeleted($comment);
            $this->guard->ensureNotEmpty($body);

            $comment->body = $body;
            if (! $comment->isDirty('body')) {
                return $comment;
            }

            $comment->edited_at = Date::now();
            $comment->save();

            $this->mentions->sync($comment->card, MentionSync::SOURCE_COMMENT, $comment->id, (new RichTextDocument($body))->mentionedUserIds(), $actor);
            $this->events->record(EventType::CardCommentEdited, $actor, $comment->card, ['comment_id' => $comment->id]);

            return $comment;
        });
    }
}
