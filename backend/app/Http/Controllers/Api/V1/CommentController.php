<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Comments\AddCommentAction;
use App\Actions\Comments\DeleteCommentAction;
use App\Actions\Comments\UpdateCommentAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Comments\SaveCommentRequest;
use App\Http\Resources\CommentResource;
use App\Models\Card;
use App\Models\Comment;
use App\Support\RichText\MentionedUsers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * Комментарии карточки — от старых к новым. Имена упомянутых — в users (id → имя) рядом с data.
 */
class CommentController extends Controller
{
    public function index(Card $card): AnonymousResourceCollection
    {
        Gate::authorize('view', $card);

        return $this->collection($card, $card->comments()->with('author')->get());
    }

    public function store(SaveCommentRequest $request, Card $card, AddCommentAction $action): JsonResponse
    {
        $comment = $action->handle($request->user(), $card, $request->validated('body'));

        return $this->single($comment)->response()->setStatusCode(201);
    }

    public function update(SaveCommentRequest $request, Comment $comment, UpdateCommentAction $action): CommentResource
    {
        return $this->single($action->handle($request->user(), $comment, $request->validated('body')));
    }

    public function destroy(Request $request, Comment $comment, DeleteCommentAction $action): CommentResource
    {
        Gate::authorize('modify', $comment);

        return $this->single($action->handle($request->user(), $comment));
    }

    /**
     * @param  Collection<int, Comment>  $comments
     */
    private function collection(Card $card, Collection $comments): AnonymousResourceCollection
    {
        $comments->each->setRelation('card', $card);

        return CommentResource::collection($comments)->additional([
            'users' => (object) MentionedUsers::names($comments->map(fn (Comment $c) => $c->isDeleted() ? null : $c->body)),
        ]);
    }

    private function single(Comment $comment): CommentResource
    {
        return (new CommentResource($comment->load(['author', 'card'])))->additional([
            'users' => (object) MentionedUsers::names([$comment->body]),
        ]);
    }
}
