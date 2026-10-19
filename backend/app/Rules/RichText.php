<?php

namespace App\Rules;

use App\Enums\UserStatus;
use App\Models\Attachment;
use App\Models\Card;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use App\Support\RichText\RichTextDocument;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Документ визуального редактора для описания или комментария карточки (docs/adr/0009-rich-text.md):
 * - структура — по белому списку RichTextDocument;
 * - упомянуть можно только того, кто видит эту карточку (CardVisibility::canSee — то же правило, что
 *   у подсказки @, поправка PM A), и не деактивированного;
 * - картинка — только вложение-изображение этой карточки.
 *
 * Упоминания и картинки, которые уже были в сохранённом документе, проходят проверку повторно:
 * правка текста не должна ломаться оттого, что упомянутый потерял доступ или вложение удалили.
 */
class RichText implements ValidationRule
{
    /**
     * @param  array<mixed>|null  $previous  сохранённый ранее документ (при изменении)
     */
    public function __construct(
        private readonly Card $card,
        private readonly ?array $previous = null,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value)) {
            $fail(__('selen.rich_text.invalid'));

            return;
        }

        $document = new RichTextDocument($value);
        if (! $document->isValid()) {
            $fail(__('selen.rich_text.invalid'));

            return;
        }

        $before = $this->previous === null ? null : new RichTextDocument($this->previous);
        $newMentions = array_diff($document->mentionedUserIds(), $before?->mentionedUserIds() ?? []);
        $newImages = array_diff($document->imageAttachmentIds(), $before?->imageAttachmentIds() ?? []);

        foreach ($newMentions as $userId) {
            if (! $this->canBeMentioned($userId)) {
                $fail(__('selen.rich_text.mention_not_allowed'));

                return;
            }
        }

        if ($newImages !== []) {
            $found = Attachment::query()->active()->where('card_id', $this->card->id)->where('kind', 'image')
                ->whereIn('id', $newImages)->count();
            if ($found !== count($newImages)) {
                $fail(__('selen.rich_text.image_not_allowed'));
            }
        }
    }

    private function canBeMentioned(string $userId): bool
    {
        $user = User::query()->find($userId);

        return $user !== null
            && $user->status !== UserStatus::Deactivated
            && app(CardVisibility::class)->canSee($user, $this->card);
    }
}
