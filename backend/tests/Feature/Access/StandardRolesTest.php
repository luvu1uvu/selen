<?php

use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\Role;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Каталог прав и стандартные роли (docs/adr/0024-rights-2.md, П2a). Права стандартных ролей ведут миграции;
| эталон — StandardRole::permissions(). Тест не даёт базе и коду разойтись и держит правила каталога.
*/

it('в базе ровно стандартные роли — с теми же областью карточек и правами, что в коде', function () {
    $roles = Role::query()->orderBy('position')->get();

    expect($roles->map(fn (Role $role) => $role->key)->all())->toBe(StandardRole::cases())
        ->and($roles->pluck('name')->all())->toBe([
            'Администратор', 'Редактор', 'Комментатор', 'Редактор — только свои карточки', 'Комментатор — только свои карточки',
        ]);

    foreach ($roles as $role) {
        $inDb = DB::table('role_permissions')->where('role_id', $role->id)->pluck('permission')->sort()->values()->all();
        $inCode = collect($role->key->permissions())->map(fn (Permission $p) => $p->value)->sort()->values()->all();

        expect($role->card_scope)->toBe($role->key->cardScope())
            ->and($inDb)->toBe($inCode, $role->key->value);
    }
});

it('права ролей — значения каталога, только права сущности; чтение — в каждой роли', function () {
    foreach (DB::table('role_permissions')->get() as $row) {
        expect(Permission::tryFrom($row->permission)?->scope())->toBe('entity', $row->permission);
    }

    foreach (StandardRole::cases() as $role) {
        expect($role->permissions())->toContain(...Permission::alwaysGranted());
    }
});

it('стандартные роли повторяют прежние: роль API и «только свои карточки» переводятся туда и обратно', function () {
    foreach ([SpaceRole::Admin, SpaceRole::Editor, SpaceRole::Commenter] as $role) {
        foreach ([false, true] as $own) {
            if ($role === SpaceRole::Admin && $own) {
                expect(fn () => StandardRole::fromLegacy($role, $own))->toThrow(LogicException::class);

                continue;
            }

            $standard = StandardRole::fromLegacy($role, $own);
            expect($standard->legacyRole())->toBe($role)
                ->and($standard->ownCardsOnly())->toBe($own);
        }
    }

    // «Только свои» отличается от полной роли только областью карточек
    expect(StandardRole::EditorOwnCards->permissions())->toBe(StandardRole::Editor->permissions())
        ->and(StandardRole::CommenterOwnCards->permissions())->toBe(StandardRole::Commenter->permissions());
});

it('права, которые до П2d проверяет системный администратор, у «Администратора» ещё не появились (решение PM 23.10)', function () {
    // Чтение папок входит в любую роль уже сейчас (В14), хотя папки доступ дают только с П2d
    $later = collect(Permission::cases())
        ->filter(fn (Permission $p) => $p->since() === 'П2d')
        ->reject(fn (Permission $p) => in_array($p, Permission::alwaysGranted(), true));

    $admin = collect(StandardRole::Admin->permissions())->map(fn (Permission $p) => $p->value);

    expect($later->map(fn (Permission $p) => $p->value)->all())->toContain('folder.create', 'space.move', 'space.delete', 'card.delete')
        ->and($later->map(fn (Permission $p) => $p->value)->intersect($admin)->all())->toBe([]);
});

it('база не даёт роли с областью «свои карточки» управлять доступом', function () {
    $own = Role::query()->forceCreate(['name' => 'Своё', 'card_scope' => CardScope::Own, 'position' => 'a9']);

    expect(fn () => DB::transaction(fn () => DB::table('role_permissions')->insert(['role_id' => $own->id, 'permission' => 'space.manage_access'])))
        ->toThrow(QueryException::class, 'a role limited to own cards cannot manage access');

    $admin = standardRole(StandardRole::Admin);
    expect(fn () => DB::transaction(fn () => DB::table('roles')->where('id', $admin->id)->update(['card_scope' => 'own'])))
        ->toThrow(QueryException::class, 'a role limited to own cards cannot manage access');
});

it('выдача — ровно одному субъекту, у субъекта на узле одна роль (до П2d)', function () {
    $space = space();
    $user = member();
    $node = nodeOf($space);
    $editor = standardRole(StandardRole::Editor);

    expect(fn () => DB::transaction(fn () => DB::table('access_grants')->insert([
        'nav_node_id' => $node->id, 'user_id' => $user->id, 'group_id' => makeGroup()->id, 'role_id' => $editor->id,
    ])))->toThrow(QueryException::class, 'access_grants_one_subject');

    grantAccess($space, $user, StandardRole::Editor);
    expect(fn () => DB::transaction(fn () => grantAccess($space, $user, StandardRole::Commenter)))
        ->toThrow(QueryException::class, 'access_grants_one_role_user');
});
