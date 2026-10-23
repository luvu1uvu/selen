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
| Матрица доступа админских маршрутов по компаниям (ADR-0017, ADR-0024): каждый маршрут admin/companies/{company}/*
| (и справочники для выбора людей и групп компании) проверяется для Владельца, администратора этой компании,
| её участника, администратора и участника другой компании. Маршруты над пользователем — с разными целями:
| участник, другой администратор компании, сам Владелец, сам проверяемый администратор. Разрешено — ответ
| не 401/403/404 и не 5xx (может быть 200, 201, 204 или 422 — до бизнес-проверок дошло); запрещено — ровно 403;
| другая компания — 404 с единым телом (её для него нет, как несуществующей).
| Права компании выдаются лично и группам с П2c — тогда строки «с правом / без права» и гость.
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
        // Пользователи компании: администраторами компании управляет только Владелец, Владельцем — никто
        ['GET', 'admin/companies/{company}/users', $allow, $allow, $deny],
        ['PATCH', 'admin/companies/{company}/users/{member}/role', $allow, $deny, $deny, ['role' => 'admin']],
        ['PATCH', 'admin/companies/{company}/users/{admin}/role', $allow, $deny, $deny, ['role' => 'member']],
        ['PATCH', 'admin/companies/{company}/users/{self-admin}/role', $allow, $deny, $deny, ['role' => 'member']],
        ['PATCH', 'admin/companies/{company}/users/{owner}/role', $deny, $deny, $deny, ['role' => 'member']],
        ['POST', 'admin/companies/{company}/users/{member}/deactivate', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/users/{admin}/deactivate', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{owner}/deactivate', $deny, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{self-admin}/deactivate', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{self-admin}/reactivate', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{deactivated-member}/reactivate', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/users/{deactivated-admin}/reactivate', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{owner}/reactivate', $deny, $deny, $deny],
        ['GET', 'admin/companies/{company}/users/{member}/access', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/users/{member}/deactivation-impact', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/users/{admin}/deactivation-impact', $allow, $deny, $deny],
        ['GET', 'admin/companies/{company}/users/{owner}/deactivation-impact', $deny, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{member}/transfer-ownership', $allow, $deny, $deny, ['password' => UserFactory::PASSWORD]],
        ['POST', 'admin/companies/{company}/users/{admin}/transfer-ownership', $allow, $deny, $deny, ['password' => UserFactory::PASSWORD]],
        ['POST', 'admin/companies/{company}/users/{owner}/transfer-ownership', $deny, $deny, $deny, ['password' => UserFactory::PASSWORD]],

        // Приглашения: с ролью администратора — только Владелец
        ['GET', 'admin/companies/{company}/invitations', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/invitations', $allow, $allow, $deny, ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member']],
        ['POST', 'admin/companies/{company}/invitations', $allow, $deny, $deny, ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'admin']],
        ['POST', 'admin/companies/{company}/invitations/{invitation-member}/resend', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/invitations/{invitation-admin}/resend', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/invitations/{invitation-member}/revoke', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/invitations/{invitation-admin}/revoke', $allow, $deny, $deny],

        // Остальная админка — администратор компании (права компании по умолчанию) и Владелец
        ['GET', 'admin/companies/{company}/groups', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/groups', $allow, $allow, $deny, ['name' => 'Новая группа']],
        ['GET', 'admin/companies/{company}/groups/{group}', $allow, $allow, $deny],
        ['PATCH', 'admin/companies/{company}/groups/{group}', $allow, $allow, $deny, ['name' => 'Переименованная']],
        ['POST', 'admin/companies/{company}/groups/{group}/archive', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/groups/{group}/restore', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/groups/{group}/members', $allow, $allow, $deny, ['user_id' => '{member}']],
        // Состав групп — доступ к пространствам, а не учётная запись: Владелец в группах — как все (ADR-0017)
        ['POST', 'admin/companies/{company}/groups/{group}/members', $allow, $allow, $deny, ['user_id' => '{owner}']],
        ['DELETE', 'admin/companies/{company}/groups/{group}/members/{member}', $allow, $allow, $deny],
        ['PUT', 'admin/companies/{company}/groups/{group}/spaces/{space}', $allow, $allow, $deny, ['role' => 'commenter']],
        ['DELETE', 'admin/companies/{company}/groups/{group}/spaces/{space}', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/events', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/spaces', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/spaces', $allow, $allow, $deny, ['name' => 'Новое', 'key' => 'NEW']],
        ['POST', 'admin/companies/{company}/spaces/{space}/archive', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/spaces/{space}/restore', $allow, $allow, $deny],
        ['DELETE', 'admin/companies/{company}/spaces/{space}', $allow, $allow, $deny],
        ['PUT', 'admin/companies/{company}/spaces/{space}/members/{member}', $allow, $allow, $deny, ['role' => 'editor']],
        ['PUT', 'admin/companies/{company}/spaces/{space}/members/{owner}', $allow, $allow, $deny, ['role' => 'editor']],
        ['GET', 'admin/companies/{company}/navigation', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/folders', $allow, $allow, $deny, ['name' => 'Новая папка']],
        ['POST', 'admin/companies/{company}/folders/{folder}/archive', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/folders/{folder}/restore', $allow, $allow, $deny],
        ['DELETE', 'admin/companies/{company}/folders/{folder}', $allow, $allow, $deny],
        ['PATCH', 'admin/companies/{company}/nav-nodes/{folder}', $allow, $allow, $deny, ['name' => 'Другая']],
        ['POST', 'admin/companies/{company}/nav-nodes/{folder}/move', $allow, $allow, $deny, ['parent_id' => null]],
        ['GET', 'admin/companies/{company}/trash/cards', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/trash/cards/{trashed-card}/restore', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/labels', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/labels', $allow, $allow, $deny, ['name' => 'Срочно', 'color' => '#ff0000']],
        ['GET', 'admin/companies/{company}/card-types', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/card-types', $allow, $allow, $deny, ['name' => 'Эпик']],
        ['PATCH', 'admin/companies/{company}/card-types/{card-type}', $allow, $allow, $deny, ['name' => 'История']],
        ['POST', 'admin/companies/{company}/card-types/{card-type}/archive', $allow, $allow, $deny],
        ['POST', 'admin/companies/{company}/card-types/{card-type}/restore', $allow, $allow, $deny],

        // Справочники для выбора людей и групп компании: администратор компании (и администраторы её пространств)
        ['GET', 'companies/{company}/users/directory', $allow, $allow, $deny],
        ['GET', 'companies/{company}/groups/directory', $allow, $allow, $deny],
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
    $other = otherCompany();
    $this->actors = [
        'owner' => owner(),
        'admin' => admin(),
        'member' => member(),
        // Другая компания: администратор и участник
        'other-admin' => admin(company: $other),
        'other-member' => member(company: $other),
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
        '{card-type}' => CardType::query()->forceCreate(['name' => 'Тип', 'color' => '#123456', 'company_id' => company()->id])->id,
        '{company}' => company()->id,
    ];
});

it('админский маршрут: Владелец, администратор компании, участник; другая компания — 404', function (string $method, string $path, bool $owner, bool $admin, bool $member, array $body, string $role) {
    $expected = ['owner' => $owner, 'admin' => $admin, 'member' => $member][$role] ?? null;
    $uri = '/api/v1/'.strtr($path, $this->objects);
    $body = array_map(fn (mixed $value) => is_string($value) ? strtr($value, $this->objects) : $value, $body);

    $response = $this->actingAs($this->actors[$role])->json($method, $uri, $body);

    match ($expected) {
        true => expect($response->status())->not->toBeIn([401, 403, 404])->toBeLessThan(500),
        false => expect($response->status())->toBe(403),
        null => $response->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]),
    };
})->with(adminEndpoints())->with(['owner', 'admin', 'member', 'other-admin', 'other-member']);

it('все админские маршруты есть в матрице доступа', function () {
    $covered = collect(adminEndpoints())
        ->map(fn (array $row) => $row[0].' '.strtr($row[1], ADMIN_PLACEHOLDERS))
        ->unique()
        ->all();

    $routes = collect(Route::getRoutes()->getRoutes())
        ->filter(fn ($route) => str_starts_with($route->uri(), 'api/v1/admin/')
            || str_starts_with($route->uri(), 'api/v1/companies/'))
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

it('справочники людей и групп компании открыты администратору её пространства без роли в компании', function () {
    $spaceAdmin = member();
    addToSpace(space(['key' => 'OPS']), $spaceAdmin, SpaceRole::Admin);
    $base = '/api/v1/companies/'.company()->id;

    $this->actingAs($spaceAdmin)->getJson("{$base}/users/directory")->assertOk();
    $this->actingAs($spaceAdmin)->getJson("{$base}/groups/directory")->assertOk();
    $this->actingAs($spaceAdmin)->getJson(adminPath().'users')->assertForbidden();
});

it('все маршруты админки — в контексте компании (admin/companies/{company}/…)', function () {
    $admin = collect(Route::getRoutes()->getRoutes())
        ->map(fn ($route) => $route->uri())
        ->filter(fn (string $uri) => str_starts_with($uri, 'api/v1/admin'));

    expect($admin)->not->toBeEmpty()
        ->and($admin->reject(fn (string $uri) => str_starts_with($uri, 'api/v1/admin/companies/{company}/'))->all())->toBe([]);
});
