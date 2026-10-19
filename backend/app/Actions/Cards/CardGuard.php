<?php

namespace App\Actions\Cards;

use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\Comment;
use App\Support\RichText\RichTextDocument;
use Illuminate\Validation\ValidationException;

/** Общие проверки для операций с карточками. */
class CardGuard
{
    public function ensureNotArchived(Card $card): void
    {
        if ($card->isArchived()) {
            throw ValidationException::withMessages(['card' => __('selen.cards.archived')]);
        }
    }

    /** Карточки лежат только в колонках без подколонок. */
    public function ensureLeaf(BoardColumn $column): void
    {
        if ($column->hasActiveChildren()) {
            throw ValidationException::withMessages(['column_id' => __('selen.columns.not_leaf')]);
        }
    }

    public function ensureCommentNotDeleted(Comment $comment): void
    {
        if ($comment->isDeleted()) {
            throw ValidationException::withMessages(['comment' => __('selen.comments.deleted')]);
        }
    }

    /**
     * Документ без текста, упоминаний и картинок — пустой комментарий.
     *
     * @param  array<mixed>  $body
     */
    public function ensureNotEmpty(array $body): void
    {
        if ((new RichTextDocument($body))->isEmpty()) {
            throw ValidationException::withMessages(['body' => __('selen.comments.empty')]);
        }
    }
}
