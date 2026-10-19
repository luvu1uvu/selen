<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Вложение карточки (docs/adr/0010-attachments.md). Файл лежит на диске disk по пути path
 * ({card_id}/{ulid}), отдаётся только через приложение с проверкой доступа к карточке.
 *
 * Удаление мягкое (deleted_at). Сам файл стирает model:prune через PURGE_AFTER_DAYS: до этого бэкап,
 * снятый в момент удаления, остаётся согласованным с базой.
 *
 * @property string $id
 * @property string $card_id
 * @property string $uploaded_by
 * @property string $disk
 * @property string $path
 * @property string $name
 * @property string $mime
 * @property int $size
 * @property string $kind image | video | file
 * @property Carbon|null $deleted_at
 * @property string|null $deleted_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Card $card
 * @property-read User $uploader
 */
class Attachment extends Model
{
    use HasUlids, Prunable;

    public const PURGE_AFTER_DAYS = 30;

    protected $dateFormat = 'Y-m-d H:i:s.uP';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['size' => 'integer', 'deleted_at' => 'datetime'];
    }

    /** @return BelongsTo<Card, $this> */
    public function card(): BelongsTo
    {
        // Карточка может быть в корзине: загружаем и её — доступ решает CardVisibility (404), а не null (ADR-0015)
        return $this->belongsTo(Card::class)->withTrashed();
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** @param  Builder<Attachment>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('deleted_at');
    }

    public function isDeleted(): bool
    {
        return $this->deleted_at !== null;
    }

    /**
     * Строки удалённых вложений старше срока — файл стирается с диска, строка остаётся (на неё ссылается журнал).
     *
     * @return Builder<Attachment>
     */
    public function prunable(): Builder
    {
        return Attachment::query()->whereNotNull('deleted_at')
            ->where('deleted_at', '<', now()->subDays(self::PURGE_AFTER_DAYS))
            ->where('path', '!=', '');
    }

    /** Вместо удаления строки — стереть файл и пометить, что его больше нет. */
    public function prune(): bool
    {
        Storage::disk($this->disk)->delete($this->path);

        return $this->forceFill(['path' => ''])->save();
    }
}
