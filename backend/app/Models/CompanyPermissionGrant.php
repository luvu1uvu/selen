<?php

namespace App\Models;

use App\Enums\Permission;
use App\Models\Concerns\BelongsToCompany;
use App\Models\Contracts\HasCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Право компании, выданное человеку («дому» компании) или группе компании (docs/adr/0024-rights-2.md, П2c): «Права
 * компании» галочками у человека и у группы. Права по выдачам вычисляет только App\Services\Access\AccessResolver
 * (действуют только у действующих «домов»; гостю — никогда); меняют их только Actions (app/Actions/Companies).
 *
 * @property int $id
 * @property string $company_id
 * @property string|null $user_id
 * @property string|null $group_id
 * @property Permission $permission
 * @property string|null $granted_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read User|null $user
 * @property-read Group|null $group
 */
class CompanyPermissionGrant extends Model implements HasCompany
{
    use BelongsToCompany;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['permission' => Permission::class];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Group, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
