<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Упоминание @сотрудника в описании карточки или комментарии. Нужно для уведомлений этапа 3.
 * Пишет только App\Services\Cards\MentionSync.
 *
 * @property int $id
 * @property string $card_id
 * @property string $user_id
 * @property string $source_type card | comment
 * @property string $source_id
 * @property string $mentioned_by
 * @property Carbon $created_at
 */
class Mention extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];
}
