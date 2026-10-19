<?php

namespace App\Actions\Comments;

use App\Actions\Cards\CardGuard;
use App\Enums\EventType;
use App\Models\Card;
use App\Models\Comment;
use App\Models\User;
use App\Services\Cards\MentionSync;
use App\Services\EventLog\EventRecorder;
use App\Support\RichText\RichTextDocument;
use Illuminate\Support\Facades\DB;

/** Комментарий к карточке. Комментировать могут все роли пространства, включая commenter. */
class AddCommentAction
{
    public function __construct(
        private readonly EventRecorder $events,
        private readonly CardGuard $guard,
        private readonly MentionSync $mentions,
    ) {}

    /**
     * @param  array<mixed>  $body  проверенный документ (App\Rules\RichText)
     */
    public function handle(User $actor, Card $card, array $body): Comment
    {
        return DB::transaction(function () use ($actor, $card, $body) {
            $this->guard->ensureNotArchived($card);
            $this->guard->ensureNotEmpty($body);

            $comment = new Comment;
            $comment->forceFill(['card_id' => $card->id, 'author_id' => $actor->id, 'body' => $body])->save();

            $this->mentions->sync($card, MentionSync::SOURCE_COMMENT, $comment->id, (new RichTextDocument($body))->mentionedUserIds(), $actor);
            $this->events->record(EventType::CardCommentAdded, $actor, $card, ['comment_id' => $comment->id]);

            return $comment;
        });
    }
}
