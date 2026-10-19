<?php

use App\Models\CardBlock;
use App\Models\EventLogEntry;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/*
| Сквозной сценарий этапа 2 «Карточка целиком» (критерии готовности 1–9; критерий 10 — make backup-verify,
| проверяется вручную, вывод — в отчёте этапа):
| S — системный администратор, A — администратор DEV, B — editor, C — commenter,
| E — editor в режиме «только свои карточки», D — сотрудник вне пространства.
*/
it('проходит сквозной сценарий этапа 2', function () {
    Storage::fake('attachments');
    // Время — только вперёд от текущего (cookie хелпера browser())
    $t0 = Carbon::now('UTC')->addDay()->setTime(9, 0);
    $this->travelTo($t0);

    $users = [];
    foreach (['S' => 'admin', 'A' => 'member', 'B' => 'member', 'C' => 'member', 'E' => 'member', 'D' => 'member'] as $name => $role) {
        $users[$name] = User::factory()->create([
            'name' => "Сотрудник {$name}",
            'email' => mb_strtolower($name).'@selen.test',
            'role' => $role,
        ]);
    }
    $login = function (string $name) {
        $browser = browser('10.0.0.'.ord($name));
        $browser->post('/api/v1/auth/login', ['email' => mb_strtolower($name).'@selen.test', 'password' => UserFactory::PASSWORD])
            ->assertOk();

        return $browser;
    };
    [$s, $a, $b, $c, $e, $d] = array_map($login, ['S', 'A', 'B', 'C', 'E', 'D']);
    $id = fn (string $name) => $users[$name]->id;

    // --- 1. DEV: A — admin, B — editor, C — commenter, E — editor «только свои карточки» ---
    $s->post('/api/v1/admin/spaces', ['name' => 'Разработка', 'key' => 'DEV', 'admin_ids' => [$id('A')]])->assertCreated();
    $boardId = $a->post('/api/v1/spaces/DEV/boards', ['name' => 'Разработка', 'template' => 'development'])
        ->assertCreated()->json('data.id');
    foreach (['B' => 'editor', 'C' => 'commenter', 'E' => 'editor'] as $name => $role) {
        $a->post('/api/v1/spaces/DEV/members', ['user_id' => $id($name), 'role' => $role])->assertCreated();
    }
    $a->patch("/api/v1/spaces/DEV/members/{$id('E')}", ['own_cards_only' => true])
        ->assertOk()->assertJsonPath('data.personal.own_cards_only', true);

    $companyLabel = $s->post('/api/v1/admin/labels', ['name' => 'Безопасность', 'color' => '#ef4444'])->assertCreated()->json('data.id');
    $spaceLabel = $a->post('/api/v1/spaces/DEV/labels', ['name' => 'Бэкенд', 'color' => '#3b82f6'])->assertCreated()->json('data.id');

    $board = $b->get("/api/v1/boards/{$boardId}")->assertOk()->json('data');
    $column = fn (string $name) => collect($board['columns'])->firstWhere('name', $name)['id'];
    $lane = $board['lanes'][0]['id'];
    $create = fn (string $title) => $b->post("/api/v1/boards/{$boardId}/cards", ['title' => $title, 'column_id' => $column('To Do'), 'lane_id' => $lane])
        ->assertCreated()->json('data.key');

    // --- 2. B создаёт DEV-1 и наполняет её -----------------------------------
    expect($create('Вход через SSO'))->toBe('DEV-1');
    $b->patch('/api/v1/cards/DEV-1', [
        'responsible_id' => $id('E'),
        'due_date' => $t0->copy()->addWeek()->toDateString(),
        'estimate_hours' => 6,
        'description' => richText('Проверить вход с ', ['mention' => $id('C')]),
    ])->assertOk();
    $b->post('/api/v1/cards/DEV-1/participants', ['user_id' => $id('C')])->assertOk();
    $b->put('/api/v1/cards/DEV-1/labels', ['label_ids' => [$companyLabel, $spaceLabel]])->assertOk();
    $checklistId = $b->post('/api/v1/cards/DEV-1/checklists', ['title' => 'Проверки'])->assertOk()->json('data.checklists.0.id');
    $b->post("/api/v1/checklists/{$checklistId}/items", ['text' => 'Вход по SSO'])->assertOk();
    $b->post('/api/v1/cards/DEV-1/links', ['url' => 'https://idp.example.com/docs', 'title' => 'Документация IdP'])->assertOk();
    $screenshot = $b->upload('/api/v1/cards/DEV-1/attachments', ['file' => uploadedFile('скриншот.png', PNG_1X1)])
        ->assertCreated()->assertJsonPath('data.kind', 'image')->json('data');
    $video = $b->upload('/api/v1/cards/DEV-1/attachments', ['file' => uploadedFile('Запись экрана.mov', MOV_HEADER)])
        ->assertCreated()->assertJsonPath('data.kind', 'video')->assertJsonPath('data.mime', 'video/quicktime')->json('data');

    $b->get('/api/v1/cards/DEV-1')->assertOk()
        ->assertJsonPath('data.customer.id', $id('B'))
        ->assertJsonPath('data.responsible.id', $id('E'))
        ->assertJsonPath('data.participants.*.id', [$id('C')])
        ->assertJsonPath('data.estimate_hours', 6)
        ->assertJsonPath('data.labels.*.id', [$companyLabel, $spaceLabel])
        ->assertJsonPath("data.mentioned_users.{$id('C')}", 'Сотрудник C')
        ->assertJsonPath('data.checklists.0.items.0.text', 'Вход по SSO')
        ->assertJsonPath('data.links.0.title', 'Документация IdP')
        ->assertJsonCount(2, 'data.attachments');

    // --- 3. DEV-2 без E блокирует DEV-1 ----------------------------------------
    expect($create('Настроить IdP'))->toBe('DEV-2');
    $b->post('/api/v1/cards/DEV-1/blocks', ['blocking_card' => 'DEV-2'])->assertCreated()
        ->assertJsonPath('data.blocks.0.blocking_card.key', 'DEV-2');
    $dev2File = $b->upload('/api/v1/cards/DEV-2/attachments', ['file' => uploadedFile('конфиг.png', PNG_1X1)])
        ->assertCreated()->json('data');

    // --- 4. E видит DEV-1, но не DEV-2 — нигде -----------------------------------
    $eBoard = $e->get("/api/v1/boards/{$boardId}")->assertOk()->json('data');
    // Счётчики колонок клиент считает по этому же списку: в To Do у E одна карточка
    expect(collect($eBoard['cards'])->pluck('key')->all())->toBe(['DEV-1'])
        ->and(collect($eBoard['cards'])->where('column_id', $column('To Do'))->count())->toBe(1)
        ->and($eBoard['cards'][0]['is_blocked'])->toBeTrue();
    $e->get('/api/v1/cards/DEV-2')->assertNotFound();
    $e->get('/api/v1/cards/DEV-2/history')->assertNotFound();
    $dev1ForE = $e->get('/api/v1/cards/DEV-1')->assertOk()
        ->assertJsonPath('data.permissions.restricted', true)
        ->assertJsonPath('data.blocks.0.blocking_card', ['hidden' => true]);
    expect($dev1ForE->content())->not->toContain('Настроить IdP')->not->toContain('DEV-2');
    $e->get('/api/v1/spaces/DEV/cards', ['search' => 'DEV-2'])->assertOk()->assertJsonPath('data', []);
    $e->get('/api/v1/spaces/DEV/cards')->assertJsonPath('data.*.key', ['DEV-1']);
    expect($e->get('/api/v1/cards/DEV-1/history')->content())->not->toContain('DEV-2')->not->toContain('Настроить IdP');

    // --- 5. C комментирует, но не меняет поля и не двигает -----------------------
    $c->post('/api/v1/cards/DEV-1/comments', ['body' => richText('Проверю вход на стенде')])->assertCreated();
    $c->get('/api/v1/cards/DEV-1')->assertJsonPath('data.permissions', ['edit' => false, 'comment' => true, 'delete' => false, 'restricted' => false]);
    $c->patch('/api/v1/cards/DEV-1', ['title' => 'Взлом'])->assertForbidden();
    $c->post('/api/v1/cards/DEV-1/move', ['column_id' => $column('In Progress'), 'lane_id' => $lane])->assertForbidden();
    $c->post('/api/v1/cards/DEV-1/blocks', ['reason' => 'Хочу'])->assertForbidden();
    $c->put('/api/v1/cards/DEV-1/labels', ['label_ids' => []])->assertForbidden();

    // --- 6. DEV-2 → Done: блокировка DEV-1 снимается сама, история сохранена ------
    $this->travelTo($t0->copy()->addHour());
    $b->post('/api/v1/cards/DEV-2/move', ['column_id' => $column('In Progress'), 'lane_id' => $lane])->assertOk();
    $this->travelTo($t0->copy()->addHours(2));
    $b->post('/api/v1/cards/DEV-2/move', ['column_id' => $column('Done'), 'lane_id' => $lane])->assertOk();

    $b->get('/api/v1/cards/DEV-1')
        ->assertJsonCount(1, 'data.blocks')
        ->assertJsonPath('data.blocks.0.end_reason', 'blocker_completed')
        ->assertJsonPath('data.blocks.0.ended_by.id', $id('B'))
        ->assertJsonPath('data.blocks.0.started_at', $t0->toIso8601ZuluString())
        ->assertJsonPath('data.blocks.0.ended_at', $t0->copy()->addHours(2)->toIso8601ZuluString());
    expect(CardBlock::query()->sole()->ended_at->equalTo($t0->copy()->addHours(2)))->toBeTrue();
    expect(collect($b->get("/api/v1/boards/{$boardId}")->json('data.cards'))->firstWhere('key', 'DEV-1')['is_blocked'])->toBeFalse();

    // --- 7. B переносит DEV-1 в In Progress: ответственный уже есть — B становится участником ---
    $this->travelTo($t0->copy()->addHours(3));
    $b->post('/api/v1/cards/DEV-1/move', ['column_id' => $column('In Progress'), 'lane_id' => $lane])->assertOk()
        ->assertJsonPath('data.responsible.id', $id('E'))
        // Участники — по имени: «Сотрудник B», «Сотрудник C»
        ->assertJsonPath('data.participants.*.id', [$id('B'), $id('C')]);
    expect(EventLogEntry::query()->where('event_type', 'card.participant_added')->latest('id')->first()->payload)
        ->toEqual(['user_id' => $id('B'), 'via' => 'auto_assign']);

    // --- 8. Файлы: участникам — да, постороннему и E для DEV-2 — 404, SVG/HTML — не inline ---
    foreach ([$b, $c, $e] as $viewer) {
        foreach ([$screenshot, $video] as $file) {
            $response = $viewer->get($file['url'].'?inline=1')->assertOk();
            expect($response->headers->get('X-Accel-Redirect'))->toStartWith('/_protected/attachments/')
                ->and($response->headers->get('Content-Disposition'))->toStartWith('inline;');
        }
    }
    $d->get($screenshot['url'])->assertNotFound();
    $d->get('/api/v1/cards/DEV-1')->assertNotFound();
    $e->get($dev2File['url'])->assertNotFound();
    foreach (['logo.svg' => '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'page.html' => '<html><script>alert(1)</script></html>'] as $name => $content) {
        $active = $b->upload('/api/v1/cards/DEV-1/attachments', ['file' => uploadedFile($name, $content)])
            ->assertCreated()->assertJsonPath('data.kind', 'file')->json('data');
        $response = $c->get($active['url'].'?inline=1')->assertOk();
        expect($response->headers->get('Content-Type'))->toBe('application/octet-stream')
            ->and($response->headers->get('Content-Disposition'))->toStartWith('attachment;');
    }

    // --- 9. В журнале нет ПДн; лента истории DEV-1 — перемещения и изменения полей ---
    expectNoPersonalDataInEventLog();
    $history = collect($b->get('/api/v1/cards/DEV-1/history')->assertOk()->json('data'));
    expect($history->where('kind', 'transition')->map(fn ($i) => [$i['transition']['reason'], $i['transition']['to_column']['name']])->values()->all())
        ->toBe([['manual', 'In Progress'], ['created', 'To Do']])
        ->and($history->where('kind', 'event')->pluck('event_type')->unique()->values()->all())->toContain(
            'card.updated', 'card.participant_added', 'card.labels_changed', 'card.checklist_added', 'card.link_added',
            'card.attachment_added', 'card.blocked', 'card.unblocked', 'card.comment_added',
        );
    $updated = $history->firstWhere('event_type', 'card.updated');
    expect($updated['payload']['changes']['responsible_id'])->toEqual(['from' => null, 'to' => $id('E')])
        ->and($updated['payload']['changes']['estimate_hours'])->toEqual(['from' => null, 'to' => 6]);
    // Новые сверху
    expect($history->pluck('at')->all())->toBe($history->pluck('at')->sortDesc()->values()->all());
});
