<?php

namespace App\Support\RichText;

use App\Models\User;

/**
 * Имена упомянутых в документах — одним запросом. В самих документах хранится только id
 * (после переименования сотрудника имя в упоминаниях тоже меняется).
 */
final class MentionedUsers
{
    /**
     * @param  iterable<array<mixed>|null>  $documents
     * @return array<string, string> id → имя
     */
    public static function names(iterable $documents): array
    {
        $ids = [];
        foreach ($documents as $document) {
            if ($document !== null) {
                array_push($ids, ...(new RichTextDocument($document))->mentionedUserIds());
            }
        }

        if ($ids === []) {
            return [];
        }

        return User::query()->whereIn('id', array_unique($ids))->pluck('name', 'id')->all();
    }
}
