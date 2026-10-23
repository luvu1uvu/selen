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

it('таблицы прав в запросах — только в точке прав и явном списке мест, где выдачи показывают или меняют', function () {
    // Права по выдачам, ролям, составу групп и членству в компаниях вычисляет только App\Services\Access (ADR-0024).
    // Остальные места — связи моделей и показ или изменение строк выдач, не вычисление прав; новое место — сюда,
    // с объяснением
    $allowed = [
        'Models/' => 'связи моделей (выдачи пространства и группы, состав группы, люди компании)',
        'Http/Controllers/Api/V1/SpaceMemberController.php' => 'показ личной выдачи во вкладке «Люди»',
    ];
    $app = realpath(__DIR__.'/../../app');
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($app, FilesystemIterator::SKIP_DOTS));
    $readers = [];

    foreach ($files as $file) {
        $path = $file->getPathname();
        $relative = substr($path, strlen($app) + 1);
        if ($file->getExtension() !== 'php' || str_starts_with($relative, 'Services/Access/')) {
            continue;
        }

        // Только строки кода (в том числе с псевдонимами и сырым SQL): упоминание в комментарии — не чтение
        foreach (token_get_all((string) file_get_contents($path)) as $token) {
            if (! is_array($token) || ! in_array($token[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)
                || preg_match('/\b(access_grants|role_permissions|roles|group_members|company_members)\b/', $token[1], $table) !== 1) {
                continue;
            }
            $permitted = $table[1] !== 'role_permissions'
                && collect($allowed)->keys()->contains(fn (string $place) => str_starts_with($relative, $place));
            if (! $permitted) {
                $readers[] = "{$relative}: {$token[1]}";
            }
        }
    }

    expect($readers)->toBe([]);
});
