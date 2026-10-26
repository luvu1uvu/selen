<?php

use App\Models\AccessGrant;
use App\Models\Invitation;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/*
| Сквозной сценарий этапа 3 «Группы пользователей и дерево папок» (критерии готовности 1–9 и данные для 10):
| S — системный администратор; Иван — в группе «Management»; Ольга — «Analysts» и лично editor в Backend;
| Пётр — «Contractors» и лично commenter во Frontend; Юля — только iOS; Борис — только Backend (без мобильных).
| Поиск по дереву (критерий 10) выполняется на клиенте — здесь проверяется, что дерево отдаёт для него
| папки, пространства и доски; сам поиск — тесты фронтенда и E2E.
*/
it('проходит сквозной сценарий этапа 3', function () {
    $t0 = Carbon::now('UTC')->addDay()->setTime(9, 0);
    $this->travelTo($t0);

    $people = ['S' => 'admin', 'ivan' => 'member', 'olga' => 'member', 'petr' => 'member', 'yulia' => 'member', 'boris' => 'member'];
    $users = [];
    foreach ($people as $name => $role) {
        // Системный администратор — теперь администратор компании (ADR-0024)
        $users[$name] = ($role === 'admin' ? User::factory()->admin() : User::factory())->create(['name' => "Сотрудник {$name}", 'email' => "{$name}@selen.test"]);
    }
    $login = function (string $name) {
        $browser = browser('10.0.3.'.(crc32($name) % 250));
        $browser->post('/api/v1/auth/login', ['email' => "{$name}@selen.test", 'password' => UserFactory::PASSWORD])->assertOk();

        return $browser;
    };
    $id = fn (string $name) => $users[$name]->id;
    $s = $login('S');

    // --- 1. Пространства и папка Mobile -------------------------------------------------------
    $spaces = [];
    foreach (['IOS' => ['iOS', '📱'], 'AND' => ['Android', '🤖'], 'FRONT' => ['Frontend', null], 'BACK' => ['Backend', null], 'MGMT' => ['Management', '📊']] as $key => [$name, $icon]) {
        $spaces[$key] = $s->post(adminPath().'spaces', ['name' => $name, 'key' => $key, 'icon' => $icon])->assertCreated()->json('data.id');
    }
    $mobile = $s->post(adminPath().'folders', ['name' => 'Mobile', 'icon' => '📦'])->assertCreated()->json('meta.created_id');
    $nodes = collect($s->get(adminPath().'navigation')->assertOk()->json('data'))->whereNotNull('space')->keyBy('space.key');
    $s->post(adminPath()."nav-nodes/{$nodes['IOS']['id']}/move", ['parent_id' => $mobile])->assertOk();
    $s->post(adminPath()."nav-nodes/{$nodes['AND']['id']}/move", ['parent_id' => $mobile, 'after_id' => $nodes['IOS']['id']])->assertOk();

    $structure = fn () => collect($s->get(adminPath().'navigation')->assertOk()->json('data'))
        ->map(fn ($n) => str_repeat('  ', $n['depth'] - 1).($n['name'] ?? $n['space']['key']))->all();
    expect($structure())->toBe(['FRONT', 'BACK', 'MGMT', 'Mobile', '  IOS', '  AND']);

    // Доски и карточки (S — личный администратор каждого пространства)
    $boards = [];
    foreach (array_keys($spaces) as $key) {
        $boards[$key] = $s->post("/api/v1/spaces/{$key}/boards", ['name' => "Доска {$key}", 'template' => 'simple'])->assertCreated()->json('data.id');
    }
    $cell = function ($browser, string $key) use ($boards) {
        $board = $browser->get("/api/v1/boards/{$boards[$key]}")->assertOk()->json('data');

        return ['column_id' => $board['columns'][0]['id'], 'lane_id' => $board['lanes'][0]['id'], 'next' => $board['columns'][1]['id']];
    };
    $sCell = $cell($s, 'AND');
    $s->post("/api/v1/boards/{$boards['AND']}/cards", ['title' => 'Пуш-уведомления'] + $sCell)->assertCreated()->assertJsonPath('data.key', 'AND-1');
    $s->post('/api/v1/cards/AND-1/move', ['column_id' => $sCell['next'], 'lane_id' => $sCell['lane_id']])->assertOk();

    // --- 2. Группы и их доступы ---------------------------------------------------------------
    $group = fn (string $name) => $s->post(adminPath().'groups', ['name' => $name])->assertCreated()->json('data.id');
    $management = $group('Management');
    $analysts = $group('Analysts');
    $contractors = $group('Contractors');
    foreach (['IOS', 'AND', 'FRONT', 'BACK'] as $key) {
        $s->put(adminPath()."groups/{$management}/spaces/{$spaces[$key]}", ['role' => 'commenter'])->assertOk();
        $s->put(adminPath()."groups/{$analysts}/spaces/{$spaces[$key]}", ['role' => 'commenter'])->assertOk();
    }
    $s->put(adminPath()."groups/{$management}/spaces/{$spaces['MGMT']}", ['role' => 'admin'])->assertOk();
    $s->put(adminPath()."groups/{$contractors}/spaces/{$spaces['FRONT']}", ['role' => 'editor', 'own_cards_only' => true])->assertOk();

    // --- 3. Иван: в «Management» сразу видит все пространства, исключён — со следующего запроса 404 ---
    $ivan = $login('ivan');
    $ivan->get('/api/v1/navigation')->assertOk()->assertExactJson(['data' => []]);
    $s->post(adminPath()."groups/{$management}/members", ['user_id' => $id('ivan')])->assertOk();
    $treeKeys = fn ($browser) => collect(navItems($browser->get('/api/v1/navigation')))
        ->flatMap(fn ($n) => $n['type'] === 'folder' ? collect($n['children'])->pluck('space.key') : [$n['space']['key']])->all();
    expect($treeKeys($ivan))->toBe(['FRONT', 'BACK', 'MGMT', 'IOS', 'AND']);
    $ivan->get('/api/v1/spaces/MGMT')->assertOk()->assertJsonPath('data.my_role', 'admin');
    $s->delete(adminPath()."groups/{$management}/members/{$id('ivan')}")->assertNoContent();
    $ivan->get('/api/v1/spaces/MGMT')->assertNotFound();
    $ivan->get("/api/v1/boards/{$boards['IOS']}")->assertNotFound();
    $ivan->get('/api/v1/navigation')->assertOk()->assertExactJson(['data' => []]);

    // --- 4. Ольга: «Analysts» + лично editor в Backend ------------------------------------------
    $s->post(adminPath()."groups/{$analysts}/members", ['user_id' => $id('olga')])->assertOk();
    $s->post('/api/v1/spaces/BACK/members', ['user_id' => $id('olga'), 'role' => 'editor'])->assertCreated();
    $olga = $login('olga');
    $olga->post("/api/v1/boards/{$boards['BACK']}/cards", ['title' => 'API отчётов'] + $cell($olga, 'BACK'))->assertCreated();
    $olga->post("/api/v1/boards/{$boards['FRONT']}/cards", ['title' => 'Нельзя'] + $cell($olga, 'FRONT'))->assertForbidden();
    $olga->patch('/api/v1/cards/AND-1', ['title' => 'Нельзя'])->assertForbidden();
    $olga->get('/api/v1/cards/AND-1')->assertOk();
    $olga->get('/api/v1/spaces/MGMT')->assertNotFound();
    expect($treeKeys($olga))->toBe(['FRONT', 'BACK', 'IOS', 'AND']);

    // --- 5. Пётр: «Contractors» (editor, только свои) + лично commenter без ограничения во Frontend ---
    $s->post(adminPath()."groups/{$contractors}/members", ['user_id' => $id('petr')])->assertOk();
    $s->post('/api/v1/spaces/FRONT/members', ['user_id' => $id('petr'), 'role' => 'commenter'])->assertCreated();
    $frontCell = $cell($s, 'FRONT');
    $s->post("/api/v1/boards/{$boards['FRONT']}/cards", ['title' => 'Чужая'] + $frontCell)->assertCreated()->assertJsonPath('data.key', 'FRONT-1');
    $s->post("/api/v1/boards/{$boards['FRONT']}/cards", ['title' => 'Своя'] + $frontCell)->assertCreated()->assertJsonPath('data.key', 'FRONT-2');
    $s->patch('/api/v1/cards/FRONT-2', ['responsible_id' => $id('petr')])->assertOk();
    $petr = $login('petr');
    $board = $petr->get("/api/v1/boards/{$boards['FRONT']}")->assertOk()->json('data');
    expect(collect($board['cards'])->pluck('can_edit', 'key')->all())->toEqual(['FRONT-1' => false, 'FRONT-2' => true]);
    $petr->patch('/api/v1/cards/FRONT-1', ['title' => 'Нельзя'])->assertForbidden();
    $petr->post('/api/v1/cards/FRONT-1/move', ['column_id' => $frontCell['next'], 'lane_id' => $frontCell['lane_id']])->assertForbidden();
    $petr->patch('/api/v1/cards/FRONT-2', ['title' => 'Своя, исправлена'])->assertOk();
    $petr->post('/api/v1/cards/FRONT-2/move', ['column_id' => $frontCell['next'], 'lane_id' => $frontCell['lane_id']])->assertOk();

    // --- 6. Папка Mobile: только с iOS для Юли, отсутствует для Бориса --------------------------
    $s->post('/api/v1/spaces/IOS/members', ['user_id' => $id('yulia'), 'role' => 'commenter'])->assertCreated();
    $s->post('/api/v1/spaces/BACK/members', ['user_id' => $id('boris'), 'role' => 'commenter'])->assertCreated();
    $yulia = $login('yulia');
    $yuliaTree = navItems($yulia->get('/api/v1/navigation'));
    expect($yuliaTree)->toHaveCount(1)
        ->and($yuliaTree[0])->toMatchArray(['type' => 'folder', 'name' => 'Mobile', 'icon' => '📦'])
        ->and(collect($yuliaTree[0]['children'])->pluck('space.key')->all())->toBe(['IOS']);

    $boris = $login('boris');
    $responses = [
        $boris->get('/api/v1/navigation'), $boris->get('/api/v1/spaces'), $boris->get('/api/v1/spaces/BACK'),
        $boris->get('/api/v1/spaces/BACK/members'), $boris->get('/api/v1/spaces/BACK/groups'),
        $boris->get('/api/v1/spaces/BACK/boards'), $boris->get("/api/v1/boards/{$boards['BACK']}"),
        $boris->get('/api/v1/cards/BACK-1'), $boris->get('/api/v1/cards/BACK-1/history'), $boris->get('/api/v1/auth/me'),
    ];
    foreach ($responses as $response) {
        $response->assertOk();
        expect($response->getContent())->not->toContain('Mobile')->not->toContain($mobile);
    }
    expect($treeKeys($boris))->toBe(['BACK']);

    // --- 7. S переносит Android в корень: ключ, номера, история и доступы не меняются ---------------
    $snapshot = fn () => [
        DB::table('spaces')->where('key', 'AND')->first(['id', 'key', 'last_card_number']),
        DB::table('cards')->where('space_id', $spaces['AND'])->get(['id', 'number', 'column_id']),
        DB::table('card_transitions')->whereIn('card_id', DB::table('cards')->select('id')->where('space_id', $spaces['AND']))->get(),
        AccessGrant::query()->onSpace($spaces['AND'])->orderBy('id')->get(['user_id', 'group_id', 'role_id'])->toArray(),
    ];
    $before = $snapshot();
    $history = $olga->get('/api/v1/cards/AND-1/history')->assertOk()->json('data');
    $s->post(adminPath()."nav-nodes/{$nodes['AND']['id']}/move", ['parent_id' => null])->assertOk();
    expect($structure())->toBe(['FRONT', 'BACK', 'MGMT', 'Mobile', '  IOS', 'AND'])
        ->and($snapshot())->toEqual($before)
        ->and($olga->get('/api/v1/cards/AND-1/history')->assertOk()->json('data'))->toEqual($history);
    $olga->get('/api/v1/cards/AND-1')->assertOk()->assertJsonPath('data.key', 'AND-1');

    // --- 8. Инвариант личного администратора --------------------------------------------------
    $s->patch("/api/v1/spaces/MGMT/members/{$id('S')}", ['role' => 'editor'])->assertUnprocessable();
    $s->delete("/api/v1/spaces/MGMT/members/{$id('S')}")->assertUnprocessable();

    // --- 9. «Все сотрудники»: Management открыт всем ---------------------------------------
    $everyone = collect($s->get(adminPath().'groups')->assertOk()->json('data'))->firstWhere('system', 'everyone');
    expect($everyone['name'])->toBe('Все сотрудники');
    $s->post('/api/v1/spaces/MGMT/groups', ['group_id' => $everyone['id'], 'role' => 'admin'])->assertUnprocessable();
    $s->post('/api/v1/spaces/MGMT/groups', ['group_id' => $everyone['id'], 'role' => 'commenter'])->assertCreated();
    $s->post(adminPath()."groups/{$everyone['id']}/archive")->assertUnprocessable();
    $s->post(adminPath()."groups/{$everyone['id']}/members", ['user_id' => $id('boris')])->assertUnprocessable();

    $invitation = Invitation::factory()->withToken('stage-3-newcomer')->create();
    $newcomer = browser('10.0.3.251');
    $newcomer->post('/api/v1/invitations/stage-3-newcomer/accept', ['password' => 'newcomer-password', 'password_confirmation' => 'newcomer-password'])->assertOk();
    $tree = navItems($newcomer->get('/api/v1/navigation'));
    expect($tree)->toHaveCount(1)
        ->and($tree[0])->toMatchArray(['type' => 'space', 'everyone' => true, 'icon' => '📊'])
        ->and($tree[0]['space']['key'])->toBe('MGMT');
    $newcomer->get('/api/v1/spaces/MGMT')->assertOk()->assertJsonPath('data.my_role', 'commenter');
    $newcomer->post("/api/v1/boards/{$boards['MGMT']}/cards", ['title' => 'Нельзя'] + $cell($newcomer, 'MGMT'))->assertForbidden();

    // Значок у папки — только когда открыты все её пространства
    $mobileNode = fn () => collect($s->get(adminPath().'navigation')->assertOk()->json('data'))->firstWhere('id', $mobile);
    expect($mobileNode()['everyone'])->toBeFalse();
    $s->post('/api/v1/spaces/IOS/groups', ['group_id' => $everyone['id'], 'role' => 'commenter'])->assertCreated();
    expect($mobileNode()['everyone'])->toBeTrue();
    expect(navItems($newcomer->get('/api/v1/navigation'))[1])->toMatchArray(['type' => 'folder', 'name' => 'Mobile', 'everyone' => true]);

    // Деактивированный новичок доступа не имеет (войти не может, а права не вычисляются)
    $s->post(adminPath()."users/{$invitation->user_id}/deactivate")->assertOk();
    $newcomer->get('/api/v1/navigation')->assertUnauthorized();

    // --- 10. Данные для поиска по дереву: папки, пространства и доски с названиями ----------------
    $yuliaTree = navItems($yulia->get('/api/v1/navigation'));
    expect($yuliaTree[0]['space'])->toMatchArray(['key' => 'MGMT', 'name' => 'Management'])
        ->and($yuliaTree[1]['name'])->toBe('Mobile')
        ->and($yuliaTree[1]['children'][0]['boards'])->toBe([['id' => $boards['IOS'], 'name' => 'Доска IOS']]);

    // Журнал: только id и значения перечислений
    expectNoPersonalDataInEventLog();
    expect(DB::table('event_log')->pluck('payload')->implode("\n"))->not->toContain('Mobile');
});
