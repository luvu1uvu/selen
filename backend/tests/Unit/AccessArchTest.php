<?php

/*
| Единая точка прав (CLAUDE.md, правило 11; docs/adr/0024-rights-2.md): права по выдачам и ролям вычисляет только
| App\Services\Access\AccessResolver, политики проверяют права каталога, а не роли.
*/

arch('политики проверяют права каталога (Permission), а не роли')
    ->expect('App\Policies')
    ->not->toUse(['App\Enums\SpaceRole', 'App\Enums\StandardRole']);

arch('выдачи доступа: читает для прав точка прав, меняют Actions пространств, показывают ресурсы')
    ->expect('App\Models\AccessGrant')
    ->toOnlyBeUsedIn([
        'App\Services\Access',
        'App\Actions\Spaces',
        'App\Models',
        'App\Http\Resources',
        'App\Http\Controllers\Api\V1\SpaceGroupController',
        // Данные для тестов и демо — в обход Actions, как и раньше
        'Database\Factories',
        'Database\Seeders',
        'Tests',
    ]);

it('таблицы прав запросами читает только App\Services\Access (модели — только связи)', function () {
    $app = realpath(__DIR__.'/../../app');
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($app, FilesystemIterator::SKIP_DOTS));
    $readers = [];

    foreach ($files as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($app) + 1);
        if ($file->getExtension() !== 'php' || str_starts_with($relative, 'Services/Access/')) {
            continue;
        }

        // Только строки кода: упоминание в комментарии — не чтение
        foreach (token_get_all((string) file_get_contents($path)) as $token) {
            if (! is_array($token) || ! in_array($token[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)) {
                continue;
            }
            $text = trim($token[1], "'\"");
            // Права ролей — только резолвер; выдачи, роли и состав групп целой таблицей — ещё связи моделей
            $tableOnly = in_array($text, ['access_grants', 'roles', 'group_members'], true);
            if (str_contains($text, 'role_permissions') || ($tableOnly && ! str_starts_with($relative, 'Models/'))) {
                $readers[] = "{$relative}: {$text}";
            }
        }
    }

    expect($readers)->toBe([]);
});
