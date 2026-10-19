<?php

use App\Actions\Cards\DeleteCardAction;
use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\CardType;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\Route;

/*
| Матрица доступа админских маршрутов (ADR-0017): каждый маршрут /admin/* (и справочники для выбора людей и групп)
| проверяется для Владельца, обычного администратора и участника. Маршруты над пользователем — с разными целями:
| участник, другой администратор, сам Владелец, сам проверяемый администратор. Разрешено — ответ не 401/403/404
| и не 5xx (может быть 200, 201, 204 или 422 — до бизнес-проверок дошло); запрещено — ровно 403.
| Новый админский маршрут без строки здесь роняет тест «все админские маршруты есть в матрице».
*/

/**
 * [метод, путь, Владелец, админ, участник, тело запроса]. В пути — объекты из фикстур (см. beforeEach).
 *
 * @return array<string, array{string, string, bool, bool, bool, array<string, mixed>}>
 */
function adminEndpoints(): array
{
    [$allow, $deny] = [true, false];
    $rows = [
        // Пользователи: администраторами управляет только Владелец, Владельцем — никто
        ['GET', 'admin/users', $allow, $allow, $deny],
        ['PATCH', 'admin/users/{member}/role', $allow, $deny, $deny, ['role' => 'admin']],
        ['PATCH', 'admin/users/{admin}/role', $allow, $deny, $deny, ['role' => 'member']],
        ['PATCH', 'admin/users/{self-admin}/role', $allow, $deny, $deny, ['role' => 'member']],
        ['PATCH', 'admin/users/{owner}/role', $deny, $deny, $deny, ['role' => 'member']],
        ['POST', 'admin/users/{member}/deactivate', $allow, $allow, $deny],
        ['POST', 'admin/users/{admin}/deactivate', $allow, $deny, $deny],
        ['POST', 'admin/users/{owner}/deactivate', $deny, $deny, $deny],
        ['POST', 'admin/users/{self-admin}/deactivate', $allow, $deny, $deny],
        ['POST', 'admin/users/{self-admin}/reactivate', $allow, $deny, $deny],
        ['POST', 'admin/users/{deactivated-member}/reactivate', $allow, $allow, $deny],
        ['POST', 'admin/users/{deactivated-admin}/reactivate', $allow, $deny, $deny],
        ['POST', 'admin/users/{owner}/reactivate', $deny, $deny, $deny],
        ['GET', 'admin/users/{member}/access', $allow, $allow, $deny],
        ['GET', 'admin/users/{member}/deactivation-impact', $allow, $allow, $deny],
        ['GET', 'admin/users/{admin}/deactivation-impact', $allow, $deny, $deny],
        ['GET', 'admin/users/{owner}/deactivation-impact', $deny, $deny, $deny],
        ['POST', 'admin/users/{member}/transfer-ownership', $allow, $deny, $deny, ['password' => UserFactory::PASSWORD]],
        ['POST', 'admin/users/{admin}/transfer-ownership', $allow, $deny, $deny, ['password' => UserFactory::PASSWORD]],
        ['POST', 'admin/users/{owner}/transfer-ownership', $deny, $deny, $deny, ['password' => UserFactory::PASSWORD]],

        // Приглашения: с ролью администратора — только Владелец
        ['GET', 'admin/invitations', $allow, $allow, $deny],
        ['POST', 'admin/invitations', $allow, $allow, $deny, ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member']],
        ['POST', 'admin/invitations', $allow, $deny, $deny, ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'admin']],
        ['POST', 'admin/invitations/{invitation-member}/resend', $allow, $allow, $deny],
        ['POST', 'admin/invitations/{invitation-admin}/resend', $allow, $deny, $deny],
        ['POST', 'admin/invitations/{invitation-member}/revoke', $allow, $allow, $deny],
        ['POST', 'admin/invitations/{invitation-admin}/revoke', $allow, $deny, $deny],

        // Остальная админка — любой системный администратор
        ['GET', 'admin/groups', $allow, $allow, $deny],
        ['POST', 'admin/groups', $allow, $allow, $deny, ['name' => 'Новая группа']],
        ['GET', 'admin/groups/{group}', $allow, $allow, $deny],
        ['PATCH', 'admin/groups/{group}', $allow, $allow, $deny, ['name' => 'Переименованная']],
        ['POST', 'admin/groups/{group}/archive', $allow, $allow, $deny],
        ['POST', 'admin/groups/{group}/restore', $allow, $allow, $deny],
        ['POST', 'admin/groups/{group}/members', $allow, $allow, $deny, ['user_id' => '{member}']],
        // Состав групп — доступ к пространствам, а не учётная запись: Владелец в группах — как все (ADR-0017)
        ['POST', 'admin/groups/{group}/members', $allow, $allow, $deny, ['user_id' => '{owner}']],
        ['DELETE', 'admin/groups/{group}/members/{member}', $allow, $allow, $deny],
        ['PUT', 'admin/groups/{group}/spaces/{space}', $allow, $allow, $deny, ['role' => 'commenter']],
        ['DELETE', 'admin/groups/{group}/spaces/{space}', $allow, $allow, $deny],
        ['GET', 'admin/events', $allow, $allow, $deny],
        ['GET', 'admin/spaces', $allow, $allow, $deny],
        ['POST', 'admin/spaces', $allow, $allow, $deny, ['name' => 'Новое', 'key' => 'NEW']],
        ['POST', 'admin/spaces/{space}/archive', $allow, $allow, $deny],
        ['POST', 'admin/spaces/{space}/restore', $allow, $allow, $deny],
        ['DELETE', 'admin/spaces/{space}', $allow, $allow, $deny],
        ['PUT', 'admin/spaces/{space}/members/{member}', $allow, $allow, $deny, ['role' => 'editor']],
        ['PUT', 'admin/spaces/{space}/members/{owner}', $allow, $allow, $deny, ['role' => 'editor']],
        ['GET', 'admin/navigation', $allow, $allow, $deny],
        ['POST', 'admin/folders', $allow, $allow, $deny, ['name' => 'Новая папка']],
        ['POST', 'admin/folders/{folder}/archive', $allow, $allow, $deny],
        ['POST', 'admin/folders/{folder}/restore', $allow, $allow, $deny],
        ['DELETE', 'admin/folders/{folder}', $allow, $allow, $deny],
        ['PATCH', 'admin/nav-nodes/{folder}', $allow, $allow, $deny, ['name' => 'Другая']],
        ['POST', 'admin/nav-nodes/{folder}/move', $allow, $allow, $deny, ['parent_id' => null]],
        ['GET', 'admin/trash/cards', $allow, $allow, $deny],
        ['POST', 'admin/trash/cards/{trashed-card}/restore', $allow, $allow, $deny],
        ['GET', 'admin/labels', $allow, $allow, $deny],
        ['POST', 'admin/labels', $allow, $allow, $deny, ['name' => 'Срочно', 'color' => '#ff0000']],
        ['GET', 'admin/card-types', $allow, $allow, $deny],
        ['POST', 'admin/card-types', $allow, $allow, $deny, ['name' => 'Эпик']],
        ['PATCH', 'admin/card-types/{card-type}', $allow, $allow, $deny, ['name' => 'История']],
        ['POST', 'admin/card-types/{card-type}/archive', $allow, $allow, $deny],
        ['POST', 'admin/card-types/{card-type}/restore', $allow, $allow, $deny],

        // Справочники для выбора людей и групп: системный администратор (и администраторы пространств)
        ['GET', 'users/directory', $allow, $allow, $deny],
        ['GET', 'groups/directory', $allow, $allow, $deny],
    ];

    $named = [];
    foreach ($rows as $row) {
        $body = $row[5] ?? [];
        $label = $row[0].' '.$row[1].($body === [] ? '' : ' '.json_encode($body, JSON_UNESCAPED_UNICODE));
        $named[$label] = [$row[0], $row[1], $row[2], $row[3], $row[4], $body];
    }

    return $named;
}

/** Плейсхолдеры путей матрицы → параметр зарегистрированного маршрута (для проверки полноты). */
const ADMIN_PLACEHOLDERS = [
    '{member}' => '{user}', '{admin}' => '{user}', '{self-admin}' => '{user}', '{owner}' => '{user}',
    '{deactivated-member}' => '{user}', '{deactivated-admin}' => '{user}',
    '{invitation-member}' => '{invitation}', '{invitation-admin}' => '{invitation}',
    '{folder}' => '{node}', '{trashed-card}' => '{key}', '{card-type}' => '{cardType}',
];

beforeEach(function () {
    $this->actors = [
        'owner' => owner(),
        'admin' => admin(),
        'member' => member(),
    ];
    $space = space(['key' => 'DEV']);
    $editor = member();
    addToSpace($space, $editor, SpaceRole::Admin);
    $card = makeCard(makeBoard($space, $editor, BoardTemplate::Simple), 'To Do', $editor);
    app(DeleteCardAction::class)->handle($editor, $card);
    $group = makeGroup();
    addToGroup($group, $member = member());
    grantGroup($space, $group, SpaceRole::Commenter);

    $this->objects = [
        '{member}' => $member->id,
        '{admin}' => admin()->id,
        '{self-admin}' => $this->actors['admin']->id,
        '{owner}' => $this->actors['owner']->id,
        '{deactivated-member}' => User::factory()->deactivated()->create()->id,
        '{deactivated-admin}' => User::factory()->admin()->create(['status' => UserStatus::Deactivated, 'deactivated_at' => now()])->id,
        '{invitation-member}' => Invitation::factory()->create()->id,
        '{invitation-admin}' => Invitation::factory()->create(['user_id' => User::factory()->admin()->invited()])->id,
        '{group}' => $group->id,
        '{space}' => $space->id,
        '{folder}' => makeFolder('Папка')->id,
        '{trashed-card}' => $card->key(),
        '{card-type}' => CardType::query()->forceCreate(['name' => 'Тип', 'color' => '#123456'])->id,
    ];
});

it('админский маршрут: Владелец, администратор, участник', function (string $method, string $path, bool $owner, bool $admin, bool $member, array $body, string $role) {
    $expected = ['owner' => $owner, 'admin' => $admin, 'member' => $member][$role];
    $uri = '/api/v1/'.strtr($path, $this->objects);
    $body = array_map(fn (mixed $value) => is_string($value) ? strtr($value, $this->objects) : $value, $body);

    $status = $this->actingAs($this->actors[$role])->json($method, $uri, $body)->status();

    if ($expected) {
        expect($status)->not->toBeIn([401, 403, 404])->toBeLessThan(500);
    } else {
        expect($status)->toBe(403);
    }
})->with(adminEndpoints())->with(['owner', 'admin', 'member']);

it('все админские маршруты есть в матрице доступа', function () {
    $covered = collect(adminEndpoints())
        ->map(fn (array $row) => $row[0].' '.strtr($row[1], ADMIN_PLACEHOLDERS))
        ->unique()
        ->all();

    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'api/v1/admin/'))
        ->flatMap(fn ($route) => collect($route->methods())
            ->reject(fn ($method) => $method === 'HEAD')
            ->map(fn ($method) => $method.' '.str_replace('api/v1/', '', $route->uri())))
        ->values()
        ->all();

    expect($routes)->not->toBeEmpty();
    foreach ($routes as $route) {
        expect($covered)->toContain($route);
    }
});

it('справочники людей и групп открыты администратору пространства без системной роли', function () {
    $spaceAdmin = member();
    addToSpace(space(['key' => 'OPS']), $spaceAdmin, SpaceRole::Admin);

    $this->actingAs($spaceAdmin)->getJson('/api/v1/users/directory')->assertOk();
    $this->actingAs($spaceAdmin)->getJson('/api/v1/groups/directory')->assertOk();
    $this->actingAs($spaceAdmin)->getJson('/api/v1/admin/users')->assertForbidden();
});
