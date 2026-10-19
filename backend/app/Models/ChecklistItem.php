<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Пункт чек-листа.
 *
 * @property string $id
 * @property string $checklist_id
 * @property string $text
 * @property bool $is_done
 * @property Carbon|null $done_at
 * @property string|null $done_by
 * @property string $position
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Checklist $checklist
 */
#[Fillable(['text'])]
class ChecklistItem extends Model
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['is_done' => 'boolean', 'done_at' => 'datetime'];
    }

    /** @return BelongsTo<Checklist, $this> */
    public function checklist(): BelongsTo
    {
        return $this->belongsTo(Checklist::class);
    }
}
