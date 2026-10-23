<?php

namespace App\Models;

use App\Enums\CardScope;
use App\Enums\StandardRole;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Роль — набор прав каталога (App\Enums\Permission) и область карточек (docs/adr/0024-rights-2.md).
 * Стандартные роли (key не пуст) создают и меняют только миграции; права ролей для вычисления доступа читает
 * только App\Services\Access\AccessResolver.
 *
 * @property string $id
 * @property StandardRole|null $key
 * @property string $name
 * @property CardScope $card_scope
 * @property bool $grants_new_permissions
 * @property string $position
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Role extends Model
{
    use HasUlids;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'key' => StandardRole::class,
            'card_scope' => CardScope::class,
            'grants_new_permissions' => 'boolean',
        ];
    }

    public static function standard(StandardRole $role): self
    {
        return self::query()->where('key', $role)->firstOrFail();
    }
}
