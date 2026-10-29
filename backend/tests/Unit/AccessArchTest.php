<?php

/*
| Единая точка прав (CLAUDE.md, правило 11; docs/adr/0024-rights-2.md): права по выдачам и ролям вычисляет только
| App\Services\Access\AccessResolver, политики проверяют права каталога, а не роли.
*/

arch('политики проверяют права каталога (Permission), а не роли')
    ->expect('App\Policies')
    ->not->toUse(['App\Enums\SpaceRole', 'App\Enums\StandardRole']);

arch('выдачи доступа: читает для прав точка прав, меняют Actions доступа и пространств, показывают ресурсы')
    ->expect('App\Models\AccessGrant')
    ->toOnlyBeUsedIn([
        'App\Services\Access',
        // П2d-1: выдачи на папки и пространства, несколько ролей — Actions доступа (SetNodeAccessAction и др.)
        'App\Actions\Access',
        'App\Actions\Spaces',
        'App\Models',
        'App\Http\Resources',
        'App\Http\Controllers\Api\V1\SpaceGroupController',
        // П2c: выдачи при передаче доступа уходящего, «спящие» выдачи бывшего Владельца, гости (их выдачи снимает
        // «Убрать гостя») — меняют выдачи, права не вычисляют
        'App\Actions\Users\AccessTransfer',
        'App\Actions\Users\FormerOwnerGrants',
        'App\Actions\Guests',
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
        $tokens = array_values(array_filter(token_get_all((string) file_get_contents($path)), fn ($t) => ! is_array($t) || $t[0] !== T_WHITESPACE));
        foreach ($tokens as $i => $token) {
            if (! is_array($token) || ! in_array($token[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)
                || preg_match('/\b(access_grants|role_permissions|roles|group_members|company_members|company_permission_grants)\b/', $token[1], $table) !== 1) {
                continue;
            }
            // Строка ровно «roles» — это и поле запроса и ответа (несколько ролей, П2d-1); таблица — в вызове table(),
            // join(), from(), Rule::exists() / unique()… или с колонкой (roles.key) и в SQL
            if (in_array(trim($token[1], '\'"'), ['roles', 'grants.*.roles', 'grants.*.roles.*', 'array:node_id,roles'], true)
                && ! (($tokens[$i - 1] ?? null) === '(' && is_array($tokens[$i - 2] ?? null)
                    && in_array($tokens[$i - 2][1], ['table', 'join', 'leftJoin', 'rightJoin', 'crossJoin', 'from', 'joinSub', 'fromSub', 'exists', 'unique'], true))) {
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
