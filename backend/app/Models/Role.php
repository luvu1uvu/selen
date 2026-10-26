<?php

namespace App\Models;

use App\Enums\CardScope;
use App\Enums\StandardRole;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Роль — набор прав каталога (App\Enums\Permission) и область карточек (docs/adr/0024-rights-2.md).
 * Стандартные роли (key не пуст) создают и меняют только миграции; права ролей для вычисления доступа читает
 * только App\Services\Access\AccessResolver. Стандартные роли общие для всех компаний (company_id пуст),
 * пользовательская роль — справочник своей компании (П2e; CHECK roles_company_check).
 *
 * @property string $id
 * @property StandardRole|null $key
 * @property string|null $company_id
 * @property string $name
 * @property CardScope $card_scope
 * @property bool $grants_new_permissions
 * @property string $position
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Role extends Model implements HasCompany
{
    use BelongsToCompany, HasUlids;

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
