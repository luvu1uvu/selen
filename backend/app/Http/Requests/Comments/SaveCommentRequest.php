<?php

namespace App\Http\Requests\Comments;

use App\Http\Requests\Concerns\KeepsRawRichText;
use App\Models\Card;
use App\Models\Comment;
use App\Rules\RichText;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Новый комментарий (POST cards/{card}/comments) или правка своего (PATCH comments/{comment}). */
class SaveCommentRequest extends FormRequest
{
    use KeepsRawRichText;

    public function authorize(): Response
    {
        /** @var Comment|null $comment */
        $comment = $this->route('comment');

        return $comment !== null ? Gate::inspect('modify', $comment) : Gate::inspect('comment', $this->route('card'));
    }

    protected function prepareForValidation(): void
    {
        $this->restoreRawRichText('body');
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Comment|null $comment */
        $comment = $this->route('comment');
        /** @var Card $card */
        $card = $comment !== null ? $comment->card : $this->route('card');

        return [
            'body' => ['required', 'array', new RichText($card, $comment?->body)],
        ];
    }
}
