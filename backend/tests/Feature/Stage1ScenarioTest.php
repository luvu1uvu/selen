<?php

use App\Models\Card;
use App\Models\CardTransition;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Carbon;

/*
| Сквозной сценарий этапа 1 (критерии готовности 1–7):
| S — системный администратор, A — администратор пространства DEV, B — editor, C — commenter,
| D — сотрудник без доступа к DEV.
*/
it('проходит сквозной сценарий этапа 1', function () {
    // Время — только вперёд от текущего: cookie с истёкшим по реальным часам сроком
    // хелпер browser() считает удалёнными (как и настоящий браузер)
    $t0 = Carbon::now('UTC')->addDay()->setTime(9, 0);
    $this->travelTo($t0);

    $users = [];
    foreach (['S' => 'admin', 'A' => 'member', 'B' => 'member', 'C' => 'member', 'D' => 'member'] as $name => $role) {
        // Системный администратор этапа 1 — теперь администратор компании (ADR-0024)
        $users[$name] = ($role === 'admin' ? User::factory()->admin() : User::factory())->create([
            'name' => "Сотрудник {$name}",
            'email' => mb_strtolower($name).'@selen.test',
        ]);
    }

    $login = function (string $name) {
        $browser = browser('10.0.0.'.ord($name));
        $browser->post('/api/v1/auth/login', ['email' => mb_strtolower($name).'@selen.test', 'password' => UserFactory::PASSWORD])
            ->assertOk();

        return $browser;
    };
    [$s, $a, $b, $c, $d] = array_map($login, ['S', 'A', 'B', 'C', 'D']);

    // --- 1. S создаёт DEV и назначает администратором A ------------------
    $spaceId = $s->post(adminPath().'spaces', ['name' => 'Разработка', 'key' => 'DEV', 'admin_ids' => [$users['A']->id]])
        ->assertCreated()
        ->assertJsonPath('data.admins.0.id', $users['A']->id)
        ->json('data.id');

    // A создаёт доску «Разработка», добавляет B (editor) и C (commenter)
    $boardId = $a->post('/api/v1/spaces/DEV/boards', ['name' => 'Разработка', 'template' => 'development'])
        ->assertCreated()->json('data.id');
    $a->post('/api/v1/spaces/DEV/members', ['user_id' => $users['B']->id, 'role' => 'editor'])->assertCreated();
    $a->post('/api/v1/spaces/DEV/members', ['user_id' => $users['C']->id, 'role' => 'commenter'])->assertCreated();

    // B не может создать пространство (кнопки у B нет: в интерфейсе она только для role=admin)
    $b->post(adminPath().'spaces', ['name' => 'Своё', 'key' => 'MINE'])->assertForbidden();
    $b->get('/api/v1/auth/me')->assertJsonPath('data.role', 'member');

    // --- 2. B создаёт DEV-1 и проводит её по доске ---------------------
    $board = $b->get("/api/v1/boards/{$boardId}")->assertOk()->json('data');
    $column = fn (string $name) => collect($board['columns'])->firstWhere('name', $name)['id'];
    $lane = $board['lanes'][0]['id'];

    $b->post("/api/v1/boards/{$boardId}/cards", ['title' => 'Первая задача', 'column_id' => $column('To Do'), 'lane_id' => $lane])
        ->assertCreated()
        ->assertJsonPath('data.key', 'DEV-1');

    $route = [
        ['+1 hour', 'In Progress'],
        ['+5 hours', 'Code Review'],
        ['+8 hours', 'Done'],
        ['+9 hours', 'Code Review'],
        ['+12 hours', 'Done'],
    ];
    foreach ($route as [$offset, $target]) {
        $this->travelTo($t0->copy()->add($offset));
        $b->post('/api/v1/cards/DEV-1/move', ['column_id' => $column($target), 'lane_id' => $lane])->assertOk();
    }

    // Прошло 12 часов: сессии остальных истекли (480 минут бездействия) — входят заново
    [$s, $a, $c, $d] = array_map($login, ['S', 'A', 'C', 'D']);

    // --- 3. C видит доску и карточку, но ничего не может изменить --------
    $c->get("/api/v1/boards/{$boardId}")
        ->assertOk()
        ->assertJsonPath('data.cards.0.key', 'DEV-1')
        ->assertJsonPath('data.permissions', ['manage' => false, 'edit_cards' => false, 'delete_cards' => false]);
    $c->get('/api/v1/cards/DEV-1')->assertOk()->assertJsonPath('data.permissions.edit', false);
    $c->patch('/api/v1/cards/DEV-1', ['title' => 'Взлом'])->assertForbidden();
    $c->post('/api/v1/cards/DEV-1/move', ['column_id' => $column('To Do'), 'lane_id' => $lane])->assertForbidden();
    $c->post("/api/v1/boards/{$boardId}/cards", ['title' => 'X', 'column_id' => $column('To Do'), 'lane_id' => $lane])->assertForbidden();
    $c->post("/api/v1/boards/{$boardId}/columns", ['name' => 'X', 'category' => 'queue'])->assertForbidden();

    // --- 4. D не видит пространство; прямые ссылки — 404 ----------------
    $d->get('/api/v1/spaces')->assertOk()->assertJsonCount(0, 'data');
    $d->get('/api/v1/cards/DEV-1')->assertNotFound();
    $d->get('/api/v1/spaces/DEV')->assertNotFound();
    $d->get('/api/v1/spaces/DEV/boards')->assertNotFound();
    $d->get('/api/v1/spaces/DEV/members')->assertNotFound();
    $d->get("/api/v1/boards/{$boardId}")->assertNotFound();
    $d->get('/api/v1/cards/DEV-1/transitions')->assertNotFound();
    $d->post('/api/v1/cards/DEV-1/move', ['column_id' => $column('To Do'), 'lane_id' => $lane])->assertNotFound();

    // --- 5. S видит DEV в админке, но не доски — пока не назначит себе роль
    $s->get(adminPath().'spaces')->assertOk()->assertJsonPath('data.0.key', 'DEV');
    $s->get("/api/v1/boards/{$boardId}")->assertNotFound();
    $s->put(adminPath()."spaces/{$spaceId}/members/{$users['S']->id}", ['role' => 'commenter'])
        ->assertOk()->assertJsonPath('data.my_role', 'commenter');
    $s->get("/api/v1/boards/{$boardId}")->assertOk();
    $assignment = $s->get(adminPath().'events?event_type=space.member_added')
        ->assertOk()
        ->assertJsonPath('data.0.actor.id', $users['S']->id)
        ->json('data.0.payload');
    // toEqual: JSONB не сохраняет порядок ключей
    expect($assignment)->toEqual(['user_id' => $users['S']->id, 'role' => 'commenter', 'via' => 'admin_panel']);

    // --- 6. Вся цепочка DEV-1 в card_transitions, метрики верны ---------
    $card = Card::query()->where('number', 1)->sole();
    $chain = CardTransition::query()->where('card_id', $card->id)->orderBy('moved_at')->orderBy('id')->get();
    $names = fn (?string $id) => $id === null ? null : collect($board['columns'])->firstWhere('id', $id)['name'];

    expect($chain->map(fn ($t) => [
        $names($t->from_column_id), $names($t->to_column_id), $t->from_category?->value, $t->to_category->value, $t->reason->value,
    ])->all())->toBe([
        [null, 'To Do', null, 'queue', 'created'],
        ['To Do', 'In Progress', 'queue', 'in_progress', 'manual'],
        ['In Progress', 'Code Review', 'in_progress', 'in_progress', 'manual'],
        ['Code Review', 'Done', 'in_progress', 'done', 'manual'],
        ['Done', 'Code Review', 'done', 'in_progress', 'manual'],
        ['Code Review', 'Done', 'in_progress', 'done', 'manual'],
    ])->and($chain->pluck('actor_id')->unique()->all())->toBe([$users['B']->id]);

    // lead = 09:00 → 21:00 = 12 ч; cycle = 10:00 → 21:00 = 11 ч
    $metrics = ['lead_time_seconds' => 12 * 3600, 'cycle_time_seconds' => 11 * 3600];
    $b->get('/api/v1/cards/DEV-1')
        ->assertJsonPath('data.metrics', $metrics)
        ->assertJsonPath('data.first_started_at', $t0->copy()->addHour()->format('Y-m-d\TH:i:s.u\Z'))
        ->assertJsonPath('data.completed_at', $t0->copy()->addHours(12)->format('Y-m-d\TH:i:s.u\Z'));

    // --- 7. Переименование Code Review и смена её типа не меняют историю -
    $before = $chain->toArray();
    $this->travelTo($t0->copy()->addHours(14));
    $a->patch('/api/v1/columns/'.$column('Code Review'), ['name' => 'Ревью кода'])->assertOk();
    $a->put('/api/v1/columns/'.$column('Code Review').'/category', ['category' => 'done'])
        ->assertOk()->assertJsonPath('data.cards_affected', 0);

    expect(CardTransition::query()->where('card_id', $card->id)->orderBy('moved_at')->orderBy('id')->get()->toArray())->toEqual($before);
    $b->get('/api/v1/cards/DEV-1')->assertJsonPath('data.metrics', $metrics);

    // В журнале событий нет email и имён
    expectNoPersonalDataInEventLog();
});
