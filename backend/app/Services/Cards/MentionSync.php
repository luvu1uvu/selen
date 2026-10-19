<?php

namespace App\Services\Cards;

use App\Models\Card;
use App\Models\Mention;
use App\Models\User;
use Illuminate\Support\Facades\Date;

/**
 * Упоминания из описания карточки или комментария — в таблицу mentions (для уведомлений этапа 3).
 * Синхронизация: новые упоминания добавляются, исчезнувшие из текста — удаляются, оставшиеся не трогаются
 * (уведомление на этапе 3 отправляется только по новой строке). Кого можно упомянуть, проверяет
 * правило App\Rules\RichText. Вызывать внутри транзакции изменения.
 */
class MentionSync
{
    public const SOURCE_CARD = 'card';

    public const SOURCE_COMMENT = 'comment';

    /**
     * @param  list<string>  $userIds
     */
    public function sync(Card $card, string $sourceType, string $sourceId, array $userIds, User $actor): void
    {
        $existing = Mention::query()->where('source_type', $sourceType)->where('source_id', $sourceId)->pluck('user_id')->all();

        $removed = array_diff($existing, $userIds);
        if ($removed !== []) {
            Mention::query()->where('source_type', $sourceType)->where('source_id', $sourceId)
                ->whereIn('user_id', $removed)->delete();
        }

        $now = Date::now();
        foreach (array_diff($userIds, $existing) as $userId) {
            Mention::query()->create([
                'card_id' => $card->id,
                'user_id' => $userId,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'mentioned_by' => $actor->id,
                'created_at' => $now,
            ]);
        }
    }
}
