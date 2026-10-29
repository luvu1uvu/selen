<?php

namespace App\Http\Requests\Concerns;

use App\Enums\StandardRole;
use App\Models\Role;
use Illuminate\Validation\Rule;

/**
 * Роли выдачи в запросе (docs/adr/0024-rights-2.md, П2d-1): список ключей стандартных ролей (`["editor",
 * "commenter_own"]`), без повторов, хотя бы одна. Пользовательские роли (П2e) встанут в тот же список своим id.
 */
trait ValidatesRoles
{
    /**
     * @return array<string, mixed>
     */
    protected function roleRules(string $field = 'roles'): array
    {
        return [
            $field => ['required', 'array', 'min:1', 'max:'.count(StandardRole::cases())],
            "{$field}.*" => ['required', 'string', 'distinct', Rule::enum(StandardRole::class)],
        ];
    }

    /**
     * Роли из проверенных ключей — одним запросом, в порядке списка ролей.
     *
     * @param  list<string>|null  $keys  по умолчанию — validated('roles')
     * @return list<Role>
     */
    public function roles(?array $keys = null): array
    {
        $keys ??= (array) $this->validated('roles');

        return self::rolesOf($keys);
    }

    /**
     * @param  list<string>  $keys
     * @return list<Role>
     */
    public static function rolesOf(array $keys): array
    {
        $order = array_flip(array_map(fn (StandardRole $role) => $role->value, StandardRole::cases()));

        return Role::query()->whereIn('key', $keys)->get()
            ->sortBy(fn (Role $role) => $order[$role->key?->value] ?? PHP_INT_MAX)
            ->values()
            ->all();
    }
}
