<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Card;
use App\Models\Group;
use App\Models\Label;
use App\Models\SpaceMember;
use App\Services\Access\SpaceAccessResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

/*
| Матрица доступа к содержимому пространств (docs/adr/0005-space-access.md).
|
| Каждый эндпоинт пространства обязан быть в списке ниже — это проверяет последний тест:
| новый маршрут без записи в матрице уронит CI. Минимальная роль:
|   member — любой участник (чтение, комментарии и файлы), editor — правка карточек,
|   admin — структура и участники, author — только автор (свой комментарий; в матрице автор — другой человек),
|   sysadmin — никакая роль пространства не даёт, только системный администратор (удаление карточки в корзину).
|
| Маршруты карточки ({card}) дополнительно проверяются для пользователя в режиме «только свои карточки»
| (ADR-0008): со своей карточкой — как его роль, с чужой — 404.
|
| Доступ через группу (ADR-0012): все маршруты проверяются и для пользователя, у которого доступ только
| через группу (каждая роль, режим «только свои карточки»), для архивной группы и после исключения из группы,
| а маршруты карточки — для смешанных источников (личный commenter + группа editor «только свои»).
| Встроенная группа «Все сотрудники» (состав вычисляется): commenter и editor — как лично, «только свои» — чужая
| карточка 404, деактивированный — 404.
|
| Путь — от /api/v1; веб-маршрут, который браузер открывает сам (ссылка на файл /files/{id}, UI-1b), — от корня («/…»).
| Запросы матрицы — с Accept: application/json: 404 у всех одинаковый JSON (bootstrap/app.php).
*/

/**
 * @return array<string, array{string, string, string}>
 */
function spaceEndpoints(): array
{
    $endpoints = [
        ['GET', 'spaces/{space}', 'member'],
        ['PATCH', 'spaces/{space}', 'admin'],
        ['GET', 'spaces/{space}/members', 'member'],
        ['POST', 'spaces/{space}/members', 'admin'],
        ['PATCH', 'spaces/{space}/members/{user}', 'admin'],
        ['DELETE', 'spaces/{space}/members/{user}', 'admin'],
        // Вкладка «Группы»: пользователю только с режимом «только свои карточки» — 403 (отдельный тест)
        ['GET', 'spaces/{space}/groups', 'member'],
        ['POST', 'spaces/{space}/groups', 'admin'],
        ['PATCH', 'spaces/{space}/groups/{group}', 'admin'],
        ['DELETE', 'spaces/{space}/groups/{group}', 'admin'],

        ['GET', 'spaces/{space}/boards', 'member'],
        ['POST', 'spaces/{space}/boards', 'admin'],
        ['GET', 'boards/{board}', 'member'],
        ['PATCH', 'boards/{board}', 'admin'],
        ['POST', 'boards/{board}/move', 'admin'],
        ['POST', 'boards/{board}/archive', 'admin'],
        ['POST', 'boards/{board}/restore', 'admin'],
        // Личное сворачивание доски на странице пространства — вид, а не изменение доски (ADR-0019)
        ['PUT', 'boards/{board}/collapsed', 'member'],
        ['DELETE', 'boards/{board}/collapsed', 'member'],
        ['GET', 'boards/{board}/archived-cards', 'editor'],

        ['POST', 'boards/{board}/columns', 'admin'],
        ['PATCH', 'columns/{column}', 'admin'],
        ['POST', 'columns/{column}/move', 'admin'],
        ['PUT', 'columns/{column}/category', 'admin'],
        ['POST', 'columns/{column}/archive', 'admin'],

        ['POST', 'boards/{board}/lanes', 'admin'],
        ['PATCH', 'lanes/{lane}', 'admin'],
        ['POST', 'lanes/{lane}/move', 'admin'],
        ['POST', 'lanes/{lane}/archive', 'admin'],
        // Личное сворачивание дорожки — вид, а не изменение доски (ADR-0019)
        ['PUT', 'lanes/{lane}/collapsed', 'member'],
        ['DELETE', 'lanes/{lane}/collapsed', 'member'],

        ['POST', 'boards/{board}/cards', 'editor'],
        ['GET', 'cards/{card}', 'member'],
        ['PATCH', 'cards/{card}', 'editor'],
        ['DELETE', 'cards/{card}', 'sysadmin'],
        ['POST', 'cards/{card}/move', 'editor'],
        ['POST', 'cards/{card}/archive', 'editor'],
        ['POST', 'cards/{card}/restore', 'editor'],
        ['GET', 'cards/{card}/transitions', 'member'],
        ['GET', 'cards/{card}/history', 'member'],
        ['POST', 'cards/{card}/participants', 'editor'],
        ['DELETE', 'cards/{card}/participants/{user}', 'editor'],
        ['PUT', 'cards/{card}/labels', 'editor'],

        ['GET', 'spaces/{space}/labels', 'member'],
        ['POST', 'spaces/{space}/labels', 'admin'],
        ['PATCH', 'labels/{label}', 'admin'],
        ['POST', 'labels/{label}/archive', 'admin'],
        ['POST', 'labels/{label}/restore', 'admin'],

        ['GET', 'cards/{card}/mentionable', 'member'],
        ['GET', 'cards/{card}/comments', 'member'],
        ['POST', 'cards/{card}/comments', 'member'],
        ['PATCH', 'comments/{comment}', 'author'],
        ['DELETE', 'comments/{comment}', 'author'],
        ['POST', 'cards/{card}/checklists', 'editor'],
        ['PATCH', 'checklists/{checklist}', 'editor'],
        ['DELETE', 'checklists/{checklist}', 'editor'],
        ['POST', 'checklists/{checklist}/items', 'editor'],
        ['PATCH', 'checklist-items/{item}', 'editor'],
        ['POST', 'checklist-items/{item}/move', 'editor'],
        ['DELETE', 'checklist-items/{item}', 'editor'],
        ['POST', 'cards/{card}/links', 'editor'],
        ['PATCH', 'card-links/{link}', 'editor'],
        ['DELETE', 'card-links/{link}', 'editor'],
        ['POST', 'cards/{card}/attachments', 'member'],
        ['GET', 'attachments/{attachment}', 'member'],
        // Ссылка на файл, которую браузер открывает сам (UI-1b, веб-маршрут вне /api/v1 — путь от корня)
        ['GET', '/files/{attachment}', 'member'],
        // Удаляет загрузивший (в матрице — другой человек), editor или admin
        ['DELETE', 'attachments/{attachment}', 'editor'],

        ['GET', 'spaces/{space}/cards', 'member'],
        ['POST', 'cards/{card}/relations', 'editor'],
        ['DELETE', 'cards/{card}/relations/{relation}', 'editor'],
        ['POST', 'cards/{card}/blocks', 'editor'],
        ['POST', 'card-blocks/{block}/resolve', 'editor'],
    ];

    return collect($endpoints)->keyBy(fn (array $e) => "{$e[0]} {$e[1]}")->all();
}

/** Префиксы маршрутов, которые относятся к содержимому пространств. */
const SPACE_ROUTE_PREFIXES = [
    'api/v1/spaces/{space', 'api/v1/boards/', 'api/v1/columns/', 'api/v1/lanes/', 'api/v1/cards/', 'api/v1/labels/',
    'api/v1/comments/', 'api/v1/checklists/', 'api/v1/checklist-items/', 'api/v1/card-links/', 'api/v1/attachments/',
    'api/v1/card-blocks/', 'files/',
];

/** Объекты внутри карточки: доступ к ним — через карточку (ADR-0008). */
const CARD_CONTENT_PLACEHOLDERS = ['{card}', '{comment}', '{checklist}', '{item}', '{link}', '{attachment}', '{block}'];

/**
 * Маршруты карточки — для проверки режима «только свои карточки».
 *
 * @return array<string, array{string, string, string}>
 */
function cardEndpoints(): array
{
    return array_filter(spaceEndpoints(), fn (array $e) => collect(CARD_CONTENT_PLACEHOLDERS)->contains(fn ($p) => str_contains($e[1], $p)));
}

beforeEach(function () {
    Storage::fake('attachments');
    $this->space = space(['key' => 'DEV']);
    $this->target = member();
    $owner = $this->owner = member();
    addToSpace($this->space, $owner, SpaceRole::Admin);
    addToSpace($this->space, $this->target, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $owner, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'Review', $owner);
    // Группа-объект маршрутов spaces/{space}/groups/{group} (не та, через которую действует проверяемый)
    $this->targetGroup = makeGroup();
    grantGroup($this->space, $this->targetGroup, SpaceRole::Commenter);
    $this->label = Label::query()->forceCreate(['space_id' => $this->space->id, 'name' => 'Метка', 'color' => '#ff0000']);

    $this->as = function (?SpaceRole $role) {
        $user = member();
        if ($role !== null) {
            addToSpace($this->space, $user, $role);
        }

        return $this->actingAs($user);
    };

    // Содержимое карточки создаётся заново для каждого вызова: удаление в одной проверке не мешает следующей
    $fresh = [
        '{comment}' => fn () => makeComment($this->card, $this->owner)->id,
        '{checklist}' => fn () => makeChecklist($this->card)->id,
        '{item}' => fn () => makeChecklistItem(makeChecklist($this->card))->id,
        '{link}' => fn () => makeCardLink($this->card, $this->owner)->id,
        '{attachment}' => fn () => makeAttachment($this->card, $this->owner)->id,
        // Связь со второй карточкой владельца (пользователю с ограничением она не видна — 422, не 403/404)
        '{relation}' => fn () => makeRelation($this->card, makeCard($this->board, 'Review', $this->owner), $this->owner)->id,
        '{block}' => fn () => makeBlock($this->card, $this->owner)->id,
    ];

    $this->call = function (string $method, string $path) use ($fresh) {
        foreach ($fresh as $placeholder => $make) {
            if (str_contains($path, $placeholder)) {
                $path = str_replace($placeholder, $make(), $path);
            }
        }

        $uri = (str_starts_with($path, '/') ? '' : '/api/v1/').strtr($path, [
            '{space}' => $this->space->key,
            '{user}' => $this->target->id,
            '{board}' => $this->board->id,
            '{column}' => columnNamed($this->board, 'Review')->id,
            '{lane}' => firstLane($this->board)->id,
            '{card}' => 'DEV-'.$this->card->number,
            '{label}' => $this->label->id,
            '{group}' => $this->targetGroup->id,
        ]);

        return $this->json($method, $uri, []);
    };
});

it('не участник получает 404', function (string $method, string $path) {
    ($this->as)(null);

    ($this->call)($method, $path)
        ->assertNotFound()
        ->assertExactJson(['message' => __('selen.not_found')]);
})->with(spaceEndpoints());

it('системный администратор без роли в пространстве получает 404', function (string $method, string $path) {
    $this->actingAs(admin());

    ($this->call)($method, $path)->assertNotFound();
})->with(spaceEndpoints());

it('Владелец без роли в пространстве, как и администратор, получает 404 (ADR-0017)', function (string $method, string $path) {
    $this->actingAs(owner());

    ($this->call)($method, $path)->assertNotFound();
})->with(spaceEndpoints());

it('commenter ничего не может изменить', function (string $method, string $path, string $level) {
    ($this->as)(SpaceRole::Commenter);

    $response = ($this->call)($method, $path);

    $level === 'member' ? expect($response->getStatusCode())->not->toBeIn([403, 404]) : $response->assertForbidden();
})->with(spaceEndpoints());

it('editor не меняет структуру и участников', function (string $method, string $path, string $level) {
    ($this->as)(SpaceRole::Editor);

    $response = ($this->call)($method, $path);

    in_array($level, ['admin', 'author', 'sysadmin'], true)
        ? $response->assertForbidden()
        : expect($response->getStatusCode())->not->toBeIn([403, 404]);
})->with(spaceEndpoints());

/** Участник пространства в режиме «только свои карточки» — лично или через группу. */
function restrictedMember($test, SpaceRole $role, string $source = 'personal')
{
    $user = member();

    if ($source === 'group') {
        addToSpaceViaGroup($test->space, $user, $role, ownCardsOnly: true);

        return $user;
    }

    addToSpace($test->space, $user, $role);
    SpaceMember::query()->where('space_id', $test->space->id)->where('user_id', $user->id)->update(['own_cards_only' => true]);

    return $user;
}

/** Ожидаемый ответ для роли: разрешено — не 403/404, иначе 403. */
function expectByLevel($response, string $level, SpaceRole $role, string $context = ''): void
{
    $allowed = match ($level) {
        'member' => true,
        'editor' => $role->canEditCards(),
        'admin' => $role->canManageSpace(),
        'author', 'sysadmin' => false,
    };

    $allowed
        ? expect($response->getStatusCode())->not->toBeIn([403, 404], $context)
        : $response->assertForbidden();
}

it('в режиме «только свои карточки» чужая карточка — 404 для любой роли', function (string $method, string $path) {
    foreach (['personal', 'group'] as $source) {
        foreach ([SpaceRole::Editor, SpaceRole::Commenter] as $role) {
            $this->actingAs(restrictedMember($this, $role, $source));

            ($this->call)($method, $path)
                ->assertNotFound()
                ->assertExactJson(['message' => __('selen.not_found')]);
        }
    }
})->with(cardEndpoints());

it('в режиме «только свои карточки» своя карточка доступна по роли', function (string $method, string $path, string $level) {
    foreach (['customer_id', 'responsible_id', 'participant'] as $how) {
        foreach ([[SpaceRole::Editor, 'personal'], [SpaceRole::Commenter, 'personal'], [SpaceRole::Editor, 'group'], [SpaceRole::Commenter, 'group']] as [$role, $source]) {
            $user = restrictedMember($this, $role, $source);
            $card = Card::query()->findOrFail($this->card->id);
            match ($how) {
                'participant' => DB::table('card_participants')->insert(['card_id' => $card->id, 'user_id' => $user->id, 'created_at' => now()]),
                default => $card->forceFill([$how => $user->id])->save(),
            };

            $this->actingAs($user);
            $response = ($this->call)($method, $path);
            $allowed = $level === 'member' || ($level === 'editor' && $role === SpaceRole::Editor);
            $allowed
                ? expect($response->getStatusCode())->not->toBeIn([403, 404], "{$how}, {$role->value}, {$source}")
                : $response->assertForbidden();

            // Вернуть карточку в исходное состояние для следующей комбинации
            DB::table('card_participants')->where('card_id', $card->id)->delete();
            Card::query()->whereKey($card->id)->update(['customer_id' => $card->created_by, 'responsible_id' => null, 'archived_at' => null]);
        }
    }
})->with(cardEndpoints());

it('через группу роли действуют так же, как лично', function (string $method, string $path, string $level) {
    // Порядок важен: admin последним — его изменения (исключение участника, отзыв группы) не мешают остальным
    foreach ([SpaceRole::Commenter, SpaceRole::Editor, SpaceRole::Admin] as $role) {
        $user = member();
        addToSpaceViaGroup($this->space, $user, $role);
        $this->actingAs($user);

        expectByLevel(($this->call)($method, $path), $level, $role, "через группу: {$role->value}");
    }
})->with(spaceEndpoints());

it('через «Все сотрудники» роли действуют так же, как лично; деактивированному — 404', function (string $method, string $path, string $level) {
    $grant = grantGroup($this->space, Group::everyone(), SpaceRole::Commenter);
    $user = member();

    foreach ([SpaceRole::Commenter, SpaceRole::Editor] as $role) {
        $grant->forceFill(['role' => $role])->save();
        $this->actingAs($user);

        expectByLevel(($this->call)($method, $path), $level, $role, "«Все сотрудники»: {$role->value}");
    }

    $deactivated = member(['status' => UserStatus::Deactivated]);
    expect(app(SpaceAccessResolver::class)->forSpace($deactivated, $this->space)->isMember())->toBeFalse();
})->with(spaceEndpoints());

it('через «Все сотрудники» в режиме «только свои карточки» чужая карточка — 404', function (string $method, string $path) {
    grantGroup($this->space, Group::everyone(), SpaceRole::Editor, ownCardsOnly: true);
    $this->actingAs(member());

    ($this->call)($method, $path)->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
})->with(cardEndpoints());

it('архивная группа и исключение из группы доступа не дают', function (string $method, string $path) {
    $archived = member();
    addToSpaceViaGroup($this->space, $archived, SpaceRole::Admin)->forceFill(['archived_at' => now()])->save();

    $removed = member();
    addToSpaceViaGroup($this->space, $removed, SpaceRole::Admin)->members()->detach($removed->id);

    foreach (['архивная группа' => $archived, 'исключён из группы' => $removed] as $case => $user) {
        $this->actingAs($user);

        expect(($this->call)($method, $path)->assertExactJson(['message' => __('selen.not_found')])->status())->toBe(404, $case);
    }
})->with(spaceEndpoints());

it('источники не смешиваются: личный commenter + группа editor «только свои» — видит все карточки, меняет свои', function (string $method, string $path, string $level) {
    $user = member();
    addToSpace($this->space, $user, SpaceRole::Commenter);
    addToSpaceViaGroup($this->space, $user, SpaceRole::Editor, ownCardsOnly: true);
    $this->actingAs($user);

    // Чужая карточка: видна (commenter без ограничения), изменения editor-уровня — 403
    expectByLevel(($this->call)($method, $path), $level, SpaceRole::Commenter, 'чужая карточка');

    // Своя карточка (ответственный): действует источник editor с ограничением
    Card::query()->whereKey($this->card->id)->update(['responsible_id' => $user->id, 'archived_at' => null]);
    expectByLevel(($this->call)($method, $path), $level, SpaceRole::Editor, 'своя карточка');
})->with(cardEndpoints());

it('пользователь только с режимом «только свои карточки» не видит групп пространства', function () {
    foreach (['personal', 'group'] as $source) {
        $this->actingAs(restrictedMember($this, SpaceRole::Editor, $source));

        $this->getJson('/api/v1/spaces/DEV/groups')->assertForbidden();
    }
});

it('ответ для чужого ресурса неотличим от несуществующего', function (string $foreign, string $missing) {
    $user = member();
    $path = fn (string $p) => strtr($p, ['{board}' => $this->board->id, '{card}' => 'DEV-'.$this->card->number]);

    $foreignResponse = $this->actingAs($user)->getJson('/api/v1/'.$path($foreign));
    $missingResponse = $this->actingAs($user)->getJson('/api/v1/'.$path($missing));

    expect($foreignResponse->status())->toBe(404)
        ->and($missingResponse->status())->toBe(404)
        ->and($foreignResponse->json())->toBe($missingResponse->json());
})->with([
    'пространство' => ['spaces/DEV', 'spaces/NOPE'],
    'доска' => ['boards/{board}', 'boards/01JA0000000000000000000000'],
    'карточка' => ['cards/{card}', 'cards/DEV-999'],
]);

it('все маршруты содержимого пространств есть в матрице доступа', function () {
    $covered = array_keys(spaceEndpoints());

    // Веб-маршрут (вне /api/v1) с объектом карточки в адресе — тоже содержимое пространства, даже с новым префиксом
    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($route) => collect(SPACE_ROUTE_PREFIXES)->contains(fn ($prefix) => str_starts_with($route->uri(), $prefix))
            || (! str_starts_with($route->uri(), 'api/') && collect(CARD_CONTENT_PLACEHOLDERS)->contains(fn ($p) => str_contains($route->uri(), $p))))
        ->flatMap(fn ($route) => collect($route->methods())
            ->reject(fn ($method) => $method === 'HEAD')
            ->map(fn ($method) => $method.' '.str_replace('{space:key}', '{space}', str_starts_with($route->uri(), 'api/v1/')
                ? substr($route->uri(), strlen('api/v1/'))
                : '/'.$route->uri())))
        ->values()
        ->all();

    expect($routes)->not->toBeEmpty();
    foreach ($routes as $route) {
        expect($covered)->toContain($route);
    }
});
