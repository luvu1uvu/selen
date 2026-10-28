<?php

use App\Actions\Cards\DeleteCardAction;
use App\Enums\BoardTemplate;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\CardType;
use App\Models\CompanyPermissionGrant;
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
| другая компания — 404 с единым телом (её для него нет, как несуществующей). Маршруты без компании в адресе (список
| и создание компаний — только Владелец) другой компании не касаются: людям другой компании — так же, как этой.
| П2c: участник с выданным правом компании (лично и через группу) — как администратор компании на маршрутах этого
| права (routePermissions) и как участник на остальных; гость компании — 404 (админки компании для него нет), как
| человек другой компании. Цели П2c — гость, отключённый Владельцем.
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
        // Компании ведёт только Владелец (П2b-2): администраторов назначает в «Пользователях» компании
        ['GET', 'admin/companies', $allow, $deny, $deny],
        ['POST', 'admin/companies', $allow, $deny, $deny, ['name' => 'Новая компания']],
        ['PATCH', 'admin/companies/{company}', $allow, $deny, $deny, ['name' => 'Переименованная компания']],

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
        // Отключить и включить учётную запись, что потеряет Владелец при передаче — только Владелец (П2c)
        ['POST', 'admin/companies/{company}/users/{member}/block', $allow, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{owner}/block', $deny, $deny, $deny],
        ['POST', 'admin/companies/{company}/users/{blocked-member}/unblock', $allow, $deny, $deny],
        ['GET', 'admin/companies/{company}/users/{member}/transfer-impact', $allow, $deny, $deny],
        // Деактивация в компании с передачей доступа преемнику
        ['POST', 'admin/companies/{company}/users/{member}/deactivate', $allow, $allow, $deny, ['successor_id' => '{successor}']],
        // Права компании человека: Владелец и администратор компании; у гостя прав компании нет (403)
        ['GET', 'admin/companies/{company}/users/{member}/permissions', $allow, $allow, $deny],
        ['PUT', 'admin/companies/{company}/users/{member}/permissions', $allow, $allow, $deny, ['permissions' => ['company.invite_users']]],
        // «Аналитику трудозатрат» выдаёт только Владелец: администратору — 422 (до правила дошло)
        ['PUT', 'admin/companies/{company}/users/{member}/permissions', $allow, $allow, $deny, ['permissions' => ['company.view_time_analytics']]],
        ['GET', 'admin/companies/{company}/users/{guest}/permissions', $deny, $deny, $deny],
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

        // Гости компании (П2c): право «управлять пользователями»
        ['POST', 'admin/companies/{company}/guests', $allow, $allow, $deny, ['email' => '{foreign-email}', 'spaces' => [['space_id' => '{space}', 'role' => 'commenter']]]],
        ['PUT', 'admin/companies/{company}/guests/{guest}', $allow, $allow, $deny, ['expires_on' => null, 'spaces' => []]],
        ['DELETE', 'admin/companies/{company}/guests/{guest}', $allow, $allow, $deny],
        ['GET', 'admin/companies/{company}/grantable-spaces', $allow, $allow, $deny],

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
        // Права компании группы (П2c): Владелец и администратор компании
        ['GET', 'admin/companies/{company}/groups/{group}/permissions', $allow, $allow, $deny],
        ['PUT', 'admin/companies/{company}/groups/{group}/permissions', $allow, $allow, $deny, ['permissions' => ['company.invite_users']]],
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
    '{deactivated-member}' => '{user}', '{deactivated-admin}' => '{user}', '{guest}' => '{user}', '{blocked-member}' => '{user}',
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
        // Гость этой компании («дом» — в другой): админки компании для него нет (П2c)
        'guest' => User::factory()->inCompany($other)->guestIn(company())->create(),
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
        // П2c: гость компании с доступом к пространству; отключённый Владельцем; преемник; email сотрудника другой
        // компании (его добавляют гостем)
        '{guest}' => tap(User::factory()->inCompany($other)->guestIn(company())->create(), fn (User $g) => addToSpace($space, $g, SpaceRole::Commenter))->id,
        '{blocked-member}' => User::factory()->blocked()->create()->id,
        '{successor}' => member()->id,
        '{foreign-email}' => $this->actors['other-member']->email,
    ];
});

/**
 * Права компании, которые открывают маршрут участнику (П2c): с ними он — как администратор компании, без них — как
 * участник. null — маршрут только Владельца и администратора компании (роли, права компании, владение, компании,
 * передача доступа при деактивации). Состав и доступ группы — ещё и «управлять доступом» (это выдача доступа).
 *
 * @return list<Permission>|null
 */
function routePermissions(string $method, string $path, array $body = []): ?array
{
    $path = (string) preg_replace('/^admin\/companies\/\{company\}\//', '', $path);

    return match (true) {
        str_starts_with($path, 'admin/companies'), isset($body['successor_id']),
        (bool) preg_match('/^users\/[^\/]+\/(role|transfer-ownership|transfer-impact|block|unblock|permissions)$/', $path),
        (bool) preg_match('/^groups\/[^\/]+\/permissions$/', $path) => null,
        $path === 'users', str_starts_with($path, 'users/'), str_starts_with($path, 'guests') => [Permission::CompanyManageUsers],
        str_starts_with($path, 'invitations'), $path === 'grantable-spaces' => [Permission::CompanyInviteUsers],
        (bool) preg_match('/^groups\/[^\/]+\/(members|spaces|archive|restore)/', $path) => [Permission::CompanyManageGroups, Permission::CompanyManageAccess],
        str_starts_with($path, 'groups') => [Permission::CompanyManageGroups],
        $path === 'events' => [Permission::CompanyViewEventLog],
        (bool) preg_match('/^spaces\/[^\/]+\/members\//', $path), str_contains($path, '/directory') => [Permission::CompanyManageAccess],
        str_starts_with($path, 'spaces'), $path === 'navigation', str_starts_with($path, 'folders'), str_starts_with($path, 'nav-nodes') => [Permission::CompanyManageStructure],
        str_starts_with($path, 'trash') => [Permission::CompanyManageTrash],
        str_starts_with($path, 'labels'), str_starts_with($path, 'card-types') => [Permission::CompanyManageDictionaries],
        default => throw new LogicException("Нет права для маршрута {$method} {$path}"),
    };
}

/** Тело и путь матрицы: плейсхолдеры объектов — и во вложенных полях тела. */
function matrixBody(array $body, array $objects): array
{
    array_walk_recursive($body, function (mixed &$value) use ($objects) {
        $value = is_string($value) ? strtr($value, $objects) : $value;
    });

    return $body;
}

it('админский маршрут: Владелец, администратор компании, участник; другая компания — 404', function (string $method, string $path, bool $owner, bool $admin, bool $member, array $body, string $role) {
    // Другая компания: компания в адресе для него не существует (404); без компании в адресе — как люди этой компании
    // Гость этой компании — как участник другой компании: компании в адресе для него нет
    $expected = ['owner' => $owner, 'admin' => $admin, 'member' => $member][$role]
        ?? (str_contains($path, '{company}') ? null : ['other-admin' => $admin, 'other-member' => $member, 'guest' => $member][$role]);
    $uri = '/api/v1/'.strtr($path, $this->objects);
    $body = matrixBody($body, $this->objects);

    $response = $this->actingAs($this->actors[$role])->json($method, $uri, $body);

    expectAdminAnswer($response, $expected);
})->with(adminEndpoints())->with(['owner', 'admin', 'member', 'other-admin', 'other-member', 'guest']);

/** true — разрешено (не 401/403/404 и не 5xx), false — ровно 403, null — 404 с единым телом. */
function expectAdminAnswer($response, ?bool $expected): void
{
    match ($expected) {
        true => expect($response->status())->not->toBeIn([401, 403, 404])->toBeLessThan(500),
        false => expect($response->status())->toBe(403),
        null => $response->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]),
    };
}

it('участник с правом компании — как администратор на маршрутах права, иначе — как участник (лично и через группу)', function (string $method, string $path, bool $owner, bool $admin, bool $member, array $body, string $source) {
    $permissions = routePermissions($method, $path, $body);
    $granted = member();
    $subject = $source === 'group' ? addToGroup(makeGroup(), $granted) : $granted;
    // Ещё одно право — не то, что нужно маршруту: лишнее не должно открывать
    $extra = in_array(Permission::CompanyManageTrash, $permissions ?? [], true) ? Permission::CompanyViewEventLog : Permission::CompanyManageTrash;
    foreach ([...($permissions ?? []), $extra] as $grant) {
        CompanyPermissionGrant::query()->forceCreate([
            'company_id' => company()->id,
            $source === 'group' ? 'group_id' : 'user_id' => $subject->id,
            'permission' => $grant,
        ]);
    }

    $response = $this->actingAs($granted)->json($method, '/api/v1/'.strtr($path, $this->objects), matrixBody($body, $this->objects));

    expectAdminAnswer($response, $permissions === null ? $member : $admin);
})->with(adminEndpoints())->with(['personal', 'group']);

it('с одним правом «управлять группами» доступ и состав группы с доступом не меняются (это выдача доступа)', function () {
    $granted = member();
    CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $granted->id, 'permission' => Permission::CompanyManageGroups]);
    $this->actingAs($granted);
    $group = $this->objects['{group}'];

    $this->putJson(adminPath()."groups/{$group}/spaces/{$this->objects['{space}']}", ['role' => 'admin'])->assertForbidden();
    $this->postJson(adminPath()."groups/{$group}/members", ['user_id' => $granted->id])->assertForbidden();
    // Группа без доступа и прав компании — её состав он ведёт
    $plain = makeGroup();
    $this->postJson(adminPath()."groups/{$plain->id}/members", ['user_id' => $granted->id])->assertOk();
    // Группа с правами компании — только администратор и Владелец, даже с «управлять доступом»
    CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'group_id' => $plain->id, 'permission' => Permission::CompanyManageUsers]);
    CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $granted->id, 'permission' => Permission::CompanyManageAccess]);
    $this->postJson(adminPath()."groups/{$plain->id}/members", ['user_id' => member()->id])->assertForbidden();
});

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

it('все маршруты админки — в контексте компании (admin/companies/{company}/…), кроме самих компаний у Владельца', function () {
    $admin = collect(Route::getRoutes()->getRoutes())
        ->map(fn ($route) => $route->uri())
        ->filter(fn (string $uri) => str_starts_with($uri, 'api/v1/admin'));
    // Экран Владельца «Компании»: список, создание, переименование (CompanyPolicy — только Владелец)
    $companies = ['api/v1/admin/companies', 'api/v1/admin/companies/{company}'];

    expect($admin)->not->toBeEmpty()
        ->and($admin->reject(fn (string $uri) => str_starts_with($uri, 'api/v1/admin/companies/{company}/') || in_array($uri, $companies, true))->all())->toBe([]);
});
