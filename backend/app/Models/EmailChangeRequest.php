<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Date;

/**
 * Запрос смены email, который ждёт подтверждения по ссылке из письма на новый адрес (LATER-9, решение PM 28.10). У человека
 * — не больше одного. Подтверждение и отмена удаляют строку, просроченные удаляет планировщик (`model:prune`,
 * routes/console.php): новый адрес — персональные данные, он хранится только пока ждёт подтверждения.
 *
 * Записи создают и удаляют только Actions смены email (App\Actions\Users\*EmailChange*).
 *
 * @property string $user_id
 * @property string $new_email
 * @property string $token_hash
 * @property string $requested_by_id
 * @property Carbon $expires_at
 * @property Carbon $created_at
 * @property-read User $user
 */
class EmailChangeRequest extends Model
{
    use Prunable;

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $keyType = 'string';

    public const UPDATED_AT = null;

    protected $guarded = [];

    protected $hidden = ['token_hash'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    public static function hashToken(#[\SensitiveParameter] string $token): string
    {
        return hash('sha256', $token);
    }

    public static function findByToken(#[\SensitiveParameter] string $token): ?self
    {
        return static::query()->where('token_hash', static::hashToken($token))->first();
    }

    /**
     * Адрес маской для писем на прежний адрес: n***@example.com — человек узнает домен и первую букву, но письмо,
     * пересланное дальше, не раскроет новый адрес целиком.
     */
    public static function mask(string $email): string
    {
        [$local, $domain] = explode('@', $email, 2) + [1 => ''];

        return mb_substr($local, 0, 1).'***@'.$domain;
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    /** @return Builder<static> */
    public function prunable(): Builder
    {
        return static::query()->where('expires_at', '<', Date::now());
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
