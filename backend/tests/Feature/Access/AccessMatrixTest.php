<?php

use App\Enums\BoardTemplate;
use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Enums\UserStatus;
use App\Models\Card;
use App\Models\Group;
use App\Models\Label;
use App\Services\Access\AccessResolver;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

/*
| Матрица доступа к содержимому пространств (docs/adr/0005-space-access.md).
|
| Каждый эндпоинт пространства обязан быть в списке ниже — это проверяет последний тест:
| новый маршрут без записи в матрице уронит CI. У эндпоинта две колонки:
|   минимальная роль (как до «Прав 2.0»): member — любой участник (чтение, комментарии и файлы), editor — правка
|   карточек, admin — структура и участники, author — только автор (свой комментарий; в матрице автор — другой
|   человек), sysadmin — никакая роль пространства не даёт, только системный администратор (удаление в корзину);
|   право каталога (ADR-0024): Permission, которое проверяет политика, или read — чтение (есть в любой роли),
|   author и sysadmin — как выше.
| Сценарии по ролям проверяют, что поведение стандартных ролей не изменилось; сценарии по правам — что у каждого
| маршрута ровно то право каталога, которое записано в матрице (роль «только это право» — разрешено, остальное — 403).
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
| Другая компания (ADR-0024): её участник и администратор получают 404 на всех маршрутах (полная проверка изоляции —
| CompanyIsolationTest).
|
| Путь — от /api/v1; веб-маршрут, который браузер открывает сам (ссылка на файл /files/{id}, UI-1b), — от корня («/…»).
| Запросы матрицы — с Accept: application/json: 404 у всех одинаковый JSON (bootstrap/app.php).
*/

/**
 * @return array<string, array{string, string, string, Permission|string}>
 */
function spaceEndpoints(): array
{
    $endpoints = [
        ['GET', 'spaces/{space}', 'member', 'read'],
        ['PATCH', 'spaces/{space}', 'admin', Permission::SpaceUpdate],
        ['GET', 'spaces/{space}/members', 'member', 'read'],
        ['POST', 'spaces/{space}/members', 'admin', Permission::SpaceManageAccess],
        ['PATCH', 'spaces/{space}/members/{user}', 'admin', Permission::SpaceManageAccess],
        ['DELETE', 'spaces/{space}/members/{user}', 'admin', Permission::SpaceManageAccess],
        // Вкладка «Группы»: пользователю только с режимом «только свои карточки» — 403 (отдельный тест)
        ['GET', 'spaces/{space}/groups', 'member', 'read'],
        ['POST', 'spaces/{space}/groups', 'admin', Permission::SpaceManageAccess],
        ['PATCH', 'spaces/{space}/groups/{group}', 'admin', Permission::SpaceManageAccess],
        ['DELETE', 'spaces/{space}/groups/{group}', 'admin', Permission::SpaceManageAccess],

        ['GET', 'spaces/{space}/boards', 'member', 'read'],
        ['POST', 'spaces/{space}/boards', 'admin', Permission::BoardCreate],
        ['GET', 'boards/{board}', 'member', 'read'],
        ['PATCH', 'boards/{board}', 'admin', Permission::BoardUpdate],
        ['POST', 'boards/{board}/move', 'admin', Permission::BoardUpdate],
        ['POST', 'boards/{board}/archive', 'admin', Permission::BoardDelete],
        ['POST', 'boards/{board}/restore', 'admin', Permission::BoardDelete],
        // Личное сворачивание доски на странице пространства — вид, а не изменение доски (ADR-0019)
        ['PUT', 'boards/{board}/collapsed', 'member', 'read'],
        ['DELETE', 'boards/{board}/collapsed', 'member', 'read'],
        ['GET', 'boards/{board}/archived-cards', 'editor', Permission::CardMove],

        ['POST', 'boards/{board}/columns', 'admin', Permission::BoardUpdate],
        ['PATCH', 'columns/{column}', 'admin', Permission::BoardUpdate],
        ['POST', 'columns/{column}/move', 'admin', Permission::BoardUpdate],
        ['PUT', 'columns/{column}/category', 'admin', Permission::BoardUpdate],
        ['POST', 'columns/{column}/archive', 'admin', Permission::BoardUpdate],

        ['POST', 'boards/{board}/lanes', 'admin', Permission::BoardUpdate],
        ['PATCH', 'lanes/{lane}', 'admin', Permission::BoardUpdate],
        ['POST', 'lanes/{lane}/move', 'admin', Permission::BoardUpdate],
        ['POST', 'lanes/{lane}/archive', 'admin', Permission::BoardUpdate],
        // Личное сворачивание дорожки — вид, а не изменение доски (ADR-0019)
        ['PUT', 'lanes/{lane}/collapsed', 'member', 'read'],
        ['DELETE', 'lanes/{lane}/collapsed', 'member', 'read'],

        ['POST', 'boards/{board}/cards', 'editor', Permission::CardCreate],
        ['GET', 'cards/{card}', 'member', 'read'],
        ['PATCH', 'cards/{card}', 'editor', Permission::CardUpdate],
        ['DELETE', 'cards/{card}', 'sysadmin', 'sysadmin'],
        ['POST', 'cards/{card}/move', 'editor', Permission::CardMove],
        ['POST', 'cards/{card}/archive', 'editor', Permission::CardMove],
        ['POST', 'cards/{card}/restore', 'editor', Permission::CardMove],
        ['GET', 'cards/{card}/transitions', 'member', 'read'],
        ['GET', 'cards/{card}/history', 'member', 'read'],
        ['POST', 'cards/{card}/participants', 'editor', Permission::CardInvite],
        ['DELETE', 'cards/{card}/participants/{user}', 'editor', Permission::CardInvite],
        ['PUT', 'cards/{card}/labels', 'editor', Permission::CardUpdate],

        ['GET', 'spaces/{space}/labels', 'member', 'read'],
        // Типы карточек компании пространства (ADR-0024)
        ['GET', 'spaces/{space}/card-types', 'member', 'read'],
        ['POST', 'spaces/{space}/labels', 'admin', Permission::SpaceUpdate],
        ['PATCH', 'labels/{label}', 'admin', Permission::SpaceUpdate],
        ['POST', 'labels/{label}/archive', 'admin', Permission::SpaceUpdate],
        ['POST', 'labels/{label}/restore', 'admin', Permission::SpaceUpdate],

        ['GET', 'cards/{card}/mentionable', 'member', 'read'],
        ['GET', 'cards/{card}/comments', 'member', 'read'],
        ['POST', 'cards/{card}/comments', 'member', Permission::CardComment],
        ['PATCH', 'comments/{comment}', 'author', 'author'],
        ['DELETE', 'comments/{comment}', 'author', 'author'],
        ['POST', 'cards/{card}/checklists', 'editor', Permission::CardUpdate],
        ['PATCH', 'checklists/{checklist}', 'editor', Permission::CardUpdate],
        ['DELETE', 'checklists/{checklist}', 'editor', Permission::CardUpdate],
        ['POST', 'checklists/{checklist}/items', 'editor', Permission::CardUpdate],
        ['PATCH', 'checklist-items/{item}', 'editor', Permission::CardUpdate],
        ['POST', 'checklist-items/{item}/move', 'editor', Permission::CardUpdate],
        ['DELETE', 'checklist-items/{item}', 'editor', Permission::CardUpdate],
        ['POST', 'cards/{card}/links', 'editor', Permission::CardUpdate],
        ['PATCH', 'card-links/{link}', 'editor', Permission::CardUpdate],
        ['DELETE', 'card-links/{link}', 'editor', Permission::CardUpdate],
        ['POST', 'cards/{card}/attachments', 'member', Permission::CardComment],
        ['GET', 'attachments/{attachment}', 'member', 'read'],
        // Ссылка на файл, которую браузер открывает сам (UI-1b, веб-маршрут вне /api/v1 — путь от корня)
        ['GET', '/files/{attachment}', 'member', 'read'],
        // Удаляет загрузивший (в матрице — другой человек), editor или admin
        ['DELETE', 'attachments/{attachment}', 'editor', Permission::CardUpdate],

        ['GET', 'spaces/{space}/cards', 'member', 'read'],
        ['POST', 'cards/{card}/relations', 'editor', Permission::CardUpdate],
        ['DELETE', 'cards/{card}/relations/{relation}', 'editor', Permission::CardUpdate],
        ['POST', 'cards/{card}/blocks', 'editor', Permission::CardUpdate],
        ['POST', 'card-blocks/{block}/resolve', 'editor', Permission::CardUpdate],
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
 * @return array<string, array{string, string, string, Permission|string}>
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

it('администратор компании без роли в пространстве получает 404', function (string $method, string $path) {
    $this->actingAs(admin());

    ($this->call)($method, $path)->assertNotFound();
})->with(spaceEndpoints());

it('Владелец без роли в пространстве, как и администратор, получает 404 (ADR-0017)', function (string $method, string $path) {
    $this->actingAs(owner());

    ($this->call)($method, $path)->assertNotFound();
})->with(spaceEndpoints());

it('участник и администратор другой компании получают 404 с единым телом (ADR-0024)', function (string $method, string $path) {
    $other = otherCompany();

    foreach ([member(company: $other), admin(company: $other)] as $stranger) {
        $this->actingAs($stranger);

        ($this->call)($method, $path)
            ->assertNotFound()
            ->assertExactJson(['message' => __('selen.not_found')]);
    }
})->with(spaceEndpoints());

it('commenter ничего не может изменить', function (string $method, string $path, string $level) {
    ($this->as)(SpaceRole::Commenter);

    $response = ($this->call)($method, $path);

    $level === 'member' ? expectAllowed($response) : $response->assertForbidden();
})->with(spaceEndpoints());

it('editor не меняет структуру и участников', function (string $method, string $path, string $level) {
    ($this->as)(SpaceRole::Editor);

    $response = ($this->call)($method, $path);

    in_array($level, ['admin', 'author', 'sysadmin'], true)
        ? $response->assertForbidden()
        : expectAllowed($response);
})->with(spaceEndpoints());

/** Участник пространства в режиме «только свои карточки» — лично или через группу. */
function restrictedMember($test, SpaceRole $role, string $source = 'personal')
{
    $user = member();

    if ($source === 'group') {
        addToSpaceViaGroup($test->space, $user, $role, ownCardsOnly: true);

        return $user;
    }

    addToSpace($test->space, $user, StandardRole::fromLegacy($role, ownCardsOnly: true));

    return $user;
}

/** Разрешено: сервер ответил не 403 / 404 и без ошибки (422 и 409 — отказ по данным, а не по правам). */
function expectAllowed($response, string $context = ''): void
{
    expect($response->getStatusCode())->toBeLessThan(500, $context)->not->toBeIn([403, 404], $context);
}

/** Прежнее правило уровней ролей (до «Прав 2.0») — заморожено здесь как эталон поведения. */
function allowedByLevel(string $level, SpaceRole $role): bool
{
    return match ($level) {
        'member' => true,
        'editor' => $role === SpaceRole::Admin || $role === SpaceRole::Editor,
        'admin' => $role === SpaceRole::Admin,
        'author', 'sysadmin' => false,
    };
}

/**
 * Разрешает ли маршрут роль с таким набором прав (область «все карточки»).
 *
 * @param  list<Permission>  $permissions
 */
function allowedByPermission(Permission|string $required, array $permissions): bool
{
    return match (true) {
        $required === 'read' => true,
        $required instanceof Permission => in_array($required, $permissions, true),
        // author, sysadmin: никакое право роли не даёт
        default => false,
    };
}

/**
 * Права каталога, которые проверяют маршруты матрицы.
 *
 * @return list<Permission>
 */
function matrixPermissions(): array
{
    return collect(spaceEndpoints())->pluck(3)
        ->filter(fn ($p) => $p instanceof Permission)
        ->unique(fn (Permission $p) => $p->value)
        ->values()
        ->all();
}

/** Ожидаемый ответ для роли: разрешено — не 403/404, иначе 403. */
function expectByLevel($response, string $level, SpaceRole $role, string $context = ''): void
{
    allowedByLevel($level, $role)
        ? expectAllowed($response, $context)
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
                ? expectAllowed($response, "{$how}, {$role->value}, {$source}")
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
    $grant = grantGroup($this->space, Group::everyone(company()), SpaceRole::Commenter);
    $user = member();

    foreach ([SpaceRole::Commenter, SpaceRole::Editor] as $role) {
        $grant->forceFill(['role_id' => standardRole(StandardRole::fromLegacy($role))->id])->save();
        $this->actingAs($user);

        expectByLevel(($this->call)($method, $path), $level, $role, "«Все сотрудники»: {$role->value}");
    }

    $deactivated = member(['status' => UserStatus::Deactivated]);
    expect(app(AccessResolver::class)->forSpace($deactivated, $this->space)->isMember())->toBeFalse();
})->with(spaceEndpoints());

it('через «Все сотрудники» в режиме «только свои карточки» чужая карточка — 404', function (string $method, string $path) {
    grantGroup($this->space, Group::everyone(company()), SpaceRole::Editor, ownCardsOnly: true);
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

it('стандартные роли: права каталога из базы дают те же ответы, что прежние уровни ролей', function () {
    foreach ([StandardRole::Admin, StandardRole::Editor, StandardRole::Commenter] as $role) {
        $permissions = DB::table('role_permissions')->where('role_id', standardRole($role)->id)->pluck('permission')
            ->map(fn (string $p) => Permission::from($p))->all();

        foreach (spaceEndpoints() as $key => [, , $level, $required]) {
            expect(allowedByPermission($required, $permissions))->toBe(allowedByLevel($level, $role->legacyRole()), "{$key}: {$role->value}");
        }
    }
});

it('у маршрута ровно его право каталога: роль «только это право» — разрешено, с любым другим — 403', function (string $method, string $path, string $level, Permission|string $required) {
    // Право маршрута — последним: его обладатель меняет данные (архив доски, исключение участника), остальные — нет
    $permissions = collect(matrixPermissions())->sortBy(fn (Permission $p) => $p === $required)->values();

    foreach ($permissions as $permission) {
        $user = member();
        grantAccess($this->space, $user, makeRole([$permission]));
        $this->actingAs($user);
        $response = ($this->call)($method, $path);

        allowedByPermission($required, [$permission])
            ? expectAllowed($response, $permission->value)
            : $response->assertForbidden();
    }
})->with(spaceEndpoints());

it('право через группу и «Все сотрудники» действует так же, как лично', function (string $method, string $path, string $level, Permission|string $required, string $source) {
    $other = collect(matrixPermissions())->first(fn (Permission $p) => $p !== $required);
    $with = $required instanceof Permission ? [$required] : [];
    $user = member();
    // «Все сотрудники»: состав не хранится — пользователь входит в неё сам, потому что активен
    $group = $source === 'group' ? addToGroup(makeGroup(), $user) : Group::everyone(company());
    $grant = grantAccess($this->space, $group, makeRole([$other]));
    $this->actingAs($user);

    // Сначала без права маршрута (другое право): ничего не меняется, разрешено только чтение
    $response = ($this->call)($method, $path);
    allowedByPermission($required, [$other])
        ? expectAllowed($response, "{$source}: {$other->value}")
        : $response->assertForbidden();

    // С правом маршрута — разрешено (кроме author и sysadmin)
    $grant->forceFill(['role_id' => makeRole($with)->id])->save();
    $response = ($this->call)($method, $path);
    allowedByPermission($required, $with)
        ? expectAllowed($response, "{$source}: право маршрута")
        : $response->assertForbidden();
})->with(spaceEndpoints())->with(['group', 'everyone']);

it('область роли «свои карточки»: чужая карточка — 404, на своей действует право роли', function (string $method, string $path, string $level, Permission|string $required) {
    $permissions = $required instanceof Permission ? [$required] : [];
    $user = member();
    grantAccess($this->space, $user, makeRole($permissions, CardScope::Own));
    $this->actingAs($user);

    ($this->call)($method, $path)->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);

    Card::query()->whereKey($this->card->id)->update(['responsible_id' => $user->id]);
    $response = ($this->call)($method, $path);
    allowedByPermission($required, $permissions)
        ? expectAllowed($response, 'своя карточка')
        : $response->assertForbidden();
})->with(cardEndpoints());

it('каждое право каталога, которое действует с П2a, проверяет хотя бы один маршрут матрицы', function () {
    $active = collect(Permission::cases())
        ->filter(fn (Permission $p) => $p->since() === 'П2a')
        ->reject(fn (Permission $p) => in_array($p, Permission::alwaysGranted(), true))
        ->map(fn (Permission $p) => $p->value);

    expect(collect(matrixPermissions())->map(fn (Permission $p) => $p->value)->sort()->values()->all())
        ->toBe($active->sort()->values()->all());
});

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
