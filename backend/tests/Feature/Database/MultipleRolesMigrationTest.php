<?php

use App\Enums\StandardRole;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Миграция П2d-1 («Права 2.0»): несколько ролей у субъекта на узле — временные индексы П2a «одна роль» снимаются.
| Откат возвращает их или отказывает, если у кого-то уже несколько ролей на одном узле (снять лишние молча — потеря).
*/

function multipleRolesMigration(): object
{
    return require database_path('migrations/2026_10_29_100001_allow_multiple_roles_per_subject.php');
}

it('откат возвращает «одна роль у субъекта на узле», повтор снова снимает', function () {
    asSchemaOwner(function () {
        $space = space();
        grantAccess($space, member(), StandardRole::Editor);
        $migration = multipleRolesMigration();

        $migration->down();
        $user = member();
        grantAccess($space, $user, StandardRole::Editor);
        expect(fn () => DB::transaction(fn () => grantAccess($space, $user, StandardRole::Commenter)))
            ->toThrow(QueryException::class, 'access_grants_one_role_user');

        $migration->up();
        grantAccess($space, $user, StandardRole::Commenter);
        expect(DB::table('access_grants')->where('user_id', $user->id)->count())->toBe(2);
    });
});

it('откат отказывает, если у субъекта несколько ролей на одном узле', function () {
    asSchemaOwner(function () {
        $folder = makeFolder('Папка');
        $group = makeGroup();
        grantAccess($folder, $group, StandardRole::Editor);
        grantAccess($folder, $group, StandardRole::Commenter);

        expect(fn () => DB::transaction(fn () => multipleRolesMigration()->down()))
            ->toThrow(RuntimeException::class, 'несколько ролей у субъекта на одном узле: 1');
        expect(DB::table('pg_indexes')->where('indexname', 'access_grants_one_role_group')->exists())->toBeFalse();
    });
});
