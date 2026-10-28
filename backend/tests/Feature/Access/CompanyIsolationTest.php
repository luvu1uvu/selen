<?php

use App\Actions\Cards\DeleteCardAction;
use App\Enums\BoardTemplate;
use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Models\CardType;
use App\Models\Company;
use App\Models\CompanyPermissionGrant;
use App\Models\Group;
use App\Models\Invitation;
use App\Models\Label;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/*
| Изоляция компаний (docs/adr/0024-rights-2.md; план «Прав 2.0», раздел 2). Одна точка — AccessResolver: выдача
| действует, только если получатель — участник компании выдачи; админка — admin/companies/{company}/… со scoped
| binding; справочники и ссылки в теле запроса — «в этой компании»; связи карточек разных компаний запрещены в БД.
|
| Компании A («Компания 1») и B наполнены одинаково (isolationFixture). Проверки:
| (а) каждый зарегистрированный маршрут с объектами B в адресе — от имени администратора A (он же администратор
|     пространства A, у него есть все права в A) — 404 с единым телом: все объекты из B, а для адреса с несколькими
|     объектами — ещё и каждый объект по очереди из B при остальных из A (свой родитель — чужой вложенный объект:
|     scoped binding). Маршрут без объектов компании в адресе — только из списка ROUTES_WITHOUT_COMPANY_OBJECTS,
|     параметр без значения в isolationParams — тоже ошибка: новый маршрут без записи здесь роняет CI;
| (б) ответы всех GET-маршрутов людям A (участник и администратор компании) не содержат ни одного маркера B —
|     названий, email, ключа, id (как проверка названий скрытых папок, ADR-0013) — и названия своей компании: у кого
|     компания одна, названий компаний нет нигде (решение PM 23.10, вопрос 5); администратору A все они отвечают
|     без ошибки (кроме маршрутов только для Владельца) — иначе проверка маркеров ничего бы не доказывала;
| (б) журнал: события без компании о людях B и системные не видны администратору A; Владельцу — системные;
| (в) ссылки на объекты B в теле запроса — 422, как на несуществующие; связать карточки A и B нельзя и в обход
|     приложения (триггер), упомянуть человека B в карточке A — тоже;
| (г) правило членства: выдача и группа человеку без «дома» в компании ничего не дают, «Все сотрудники» A — только
|     люди A, администратор B не управляет людьми A.
*/

/**
 * Маршруты без объектов компании в адресе: их ответы проверяет (б), изменения — свои объекты пользователя.
 * Новый маршрут без параметров — сюда, с причиной.
 */
const ROUTES_WITHOUT_COMPANY_OBJECTS = [
    'POST auth/login', 'POST auth/forgot-password', 'POST auth/reset-password', 'POST auth/logout', 'GET auth/me',
    // Приглашение по токену из письма — до входа, без компании в адресе
    'GET invitations/{token}', 'POST invitations/{token}/accept',
    // Свой профиль
    'PATCH profile', 'PUT profile/password', 'PUT profile/theme',
    // Свои дерево и пространства — только по правам пользователя (проверяет (б))
    'GET navigation', 'GET spaces',
    // Компании — экран Владельца (CompanyPolicy): ему видны все компании по определению, остальным — 403
    'GET admin/companies', 'POST admin/companies',
    // Служебные маршруты фреймворка (в том числе выдача файлов локального диска — путь, не объект компании)
    'GET sanctum/csrf-cookie', 'GET up', 'GET storage/{path}', 'PUT storage/{path}',
];

/**
 * GET-маршруты только для Владельца: администратору компании A они отвечают 403 — (б) проверяет и их ответы на маркеры,
 * но не требует успешного ответа.
 */
const OWNER_ONLY_GET_ROUTES = ['admin/companies', 'admin/companies/{company}/users/{user}/transfer-impact'];

/**
 * Одинаковое наполнение компании: папка с пространством, доска, карточки со всем содержимым, метки пространства
 * и компании, группа с доступом, приглашение, свой тип карточки, удалённая карточка. Люди: администратор компании
 * (он же администратор пространства) и редактор. В каждом названии — метка компании $tag.
 *
 * @return array<string, mixed>
 */
function isolationFixture(Company $company, string $tag, string $key): array
{
    $admin = admin(['name' => "Админ {$tag}", 'email' => "admin-{$key}@selen.test"], $company);
    $editor = member(['name' => "Редактор {$tag}", 'email' => "editor-{$key}@selen.test"], $company);
    $folder = makeFolder("Папка {$tag}", company: $company);
    $space = space(['key' => $key, 'name' => "Пространство {$tag}", 'company_id' => $company->id]);
    placeIn(nodeOf($space), $folder);
    addToSpace($space, $admin, SpaceRole::Admin);
    addToSpace($space, $editor, SpaceRole::Editor);

    $board = makeBoard($space, $admin, BoardTemplate::Simple, "Доска {$tag}");
    $card = makeCard($board, 'Review', $admin, "Карточка {$tag}");
    $second = makeCard($board, 'Review', $admin, "Вторая карточка {$tag}");
    $trashed = makeCard($board, 'Review', $admin, "Удалённая карточка {$tag}");
    app(DeleteCardAction::class)->handle($admin, $trashed);

    $group = addToGroup(makeGroup(['name' => "Группа {$tag}", 'company_id' => $company->id]), $editor);
    grantGroup($space, $group, SpaceRole::Commenter);
    $invited = User::factory()->invited()->inCompany($company)->create(['name' => "Приглашённый {$tag}", 'email' => "invited-{$key}@selen.test"]);

    return [
        'company' => $company,
        'admin' => $admin,
        'editor' => $editor,
        'folder' => $folder,
        'space' => $space,
        'board' => $board,
        'card' => $card,
        'second' => $second,
        'trashed' => $trashed,
        'group' => $group,
        'invited' => $invited,
        'invitation' => Invitation::factory()->create(['company_id' => $company->id, 'user_id' => $invited->id]),
        'space_label' => Label::query()->forceCreate(['company_id' => $company->id, 'space_id' => $space->id, 'name' => "Метка {$tag}", 'color' => '#ff0000']),
        'company_label' => Label::query()->forceCreate(['company_id' => $company->id, 'name' => "Общая метка {$tag}", 'color' => '#00ff00']),
        'card_type' => CardType::query()->forceCreate(['company_id' => $company->id, 'name' => "Тип {$tag}", 'color' => '#123456']),
        'comment' => makeComment($card, $admin, "Комментарий {$tag}"),
        'checklist' => $checklist = makeChecklist($card, "Чек-лист {$tag}"),
        'item' => makeChecklistItem($checklist, "Пункт {$tag}"),
        'link' => makeCardLink($card, $admin),
        'attachment' => makeAttachment($card, $admin, "файл-{$key}.png"),
        'relation' => makeRelation($card, $second, $admin),
        'block' => makeBlock($card, $admin, reason: "Причина {$tag}"),
    ];
}

/**
 * Значения параметров адреса — объекты компании из наполнения.
 *
 * @param  array<string, mixed>  $f
 * @return array<string, string>
 */
function isolationParams(array $f): array
{
    return [
        '{space}' => $f['space']->key,
        '{board}' => $f['board']->id,
        '{column}' => columnNamed($f['board'], 'Review')->id,
        '{lane}' => firstLane($f['board'])->id,
        '{card}' => $f['card']->key(),
        '{comment}' => $f['comment']->id,
        '{checklist}' => $f['checklist']->id,
        '{item}' => $f['item']->id,
        '{link}' => $f['link']->id,
        '{attachment}' => $f['attachment']->id,
        '{relation}' => $f['relation']->id,
        '{block}' => $f['block']->id,
        '{label}' => $f['space_label']->id,
        '{group}' => $f['group']->id,
        '{user}' => $f['editor']->id,
        '{invitation}' => $f['invitation']->id,
        '{node}' => $f['folder']->id,
        '{cardType}' => $f['card_type']->id,
        '{key}' => $f['trashed']->key(),
        '{company}' => $f['company']->id,
    ];
}

/**
 * Маркеры компании в ответах: каждое название содержит её метку, плюс email, ключ и id объектов (в том числе
 * справочников из шаблона: «Все сотрудники», типы карточек — названия у них те же, что в других компаниях).
 *
 * @param  array<string, mixed>  $f
 * @return list<string>
 */
function isolationMarkers(array $f, string $tag): array
{
    $ids = collect($f)->filter(fn ($value) => is_object($value) && isset($value->id))->map(fn ($value) => (string) $value->id);
    $ids = $ids->merge(CardType::query()->inCompany($f['company'])->pluck('id'))
        ->push(Group::everyone($f['company'])->id);

    return [$tag, $f['company']->name, $f['space']->key.'-', $f['admin']->email, $f['editor']->email, $f['invited']->email, ...$ids->values()->all()];
}

/**
 * Все маршруты: [метод, путь от /api/v1 (веб-маршрут — от корня, «/…»), имена параметров].
 *
 * @return list<array{string, string, list<string>}>
 */
function isolationRoutes(): array
{
    return collect(Route::getRoutes()->getRoutes())
        ->flatMap(fn ($route) => collect($route->methods())
            ->reject(fn (string $method) => $method === 'HEAD')
            ->map(fn (string $method) => [
                $method,
                str_starts_with($route->uri(), 'api/v1/') ? substr($route->uri(), strlen('api/v1/')) : '/'.$route->uri(),
                $route->parameterNames(),
            ]))
        ->values()
        ->all();
}

function isolationPath(string $path, array $params): string
{
    $path = str_replace('{space:key}', '{space}', $path);

    return (str_starts_with($path, '/') ? '' : '/api/v1/').strtr($path, $params);
}

function isolationContent(TestResponse $response): string
{
    return $response->baseResponse instanceof StreamedResponse ? (string) $response->streamedContent() : (string) $response->getContent();
}

beforeEach(function () {
    Storage::fake('attachments');
    // Название своей компании — тоже маркер для людей с одной компанией: его нет ни в одном ответе
    company()->update(['name' => 'Компания Альфа-имя']);
    $this->a = isolationFixture(company(), 'Альфа-маркер', 'ALFA');
    $this->b = isolationFixture(otherCompany(['name' => 'Компания Бета-маркер']), 'Бета-маркер', 'BETA');
});

it('(а) каждый маршрут с объектами другой компании — 404 с единым телом', function () {
    $this->actingAs($this->a['admin']);
    $paramsA = isolationParams($this->a);
    $paramsB = isolationParams($this->b);
    $failures = [];
    $checked = 0;

    foreach (isolationRoutes() as [$method, $path, $names]) {
        $route = "{$method} ".str_replace('{space:key}', '{space}', ltrim($path, '/'));
        if ($names === [] || $names === ['token'] || $names === ['path']) {
            in_array($route, ROUTES_WITHOUT_COMPANY_OBJECTS, true) || $failures[] = "{$route}: нет в ROUTES_WITHOUT_COMPANY_OBJECTS";

            continue;
        }

        $variants = [$paramsB];
        if (count($names) > 1) {
            // Каждый объект адреса по очереди — чужой, остальные свои: свой родитель не открывает чужой вложенный объект
            foreach ($names as $name) {
                $variants[] = ["{{$name}}" => $paramsB["{{$name}}"] ?? '{'.$name.'}'] + $paramsA;
            }
        }
        if (in_array('label', $names, true)) {
            $variants[] = ['{label}' => $this->b['company_label']->id] + $paramsB;
        }

        foreach ($variants as $params) {
            $uri = isolationPath($path, $params);
            if (str_contains($uri, '{')) {
                $failures[] = "{$route}: параметр без значения в isolationParams";

                continue;
            }
            $response = $this->json($method, $uri, []);
            $checked++;
            if ($response->status() !== 404 || $response->json() !== ['message' => __('selen.not_found')]) {
                $failures[] = "{$method} {$uri}: {$response->status()} ".mb_substr(isolationContent($response), 0, 200);
            }
        }
    }

    expect($checked)->toBeGreaterThan(100)
        ->and($failures)->toBe([]);
});

it('(б) ответы GET-маршрутов людям компании A не содержат ни одного маркера компании B', function (string $who) {
    $this->actingAs($this->a[$who]);
    $params = isolationParams($this->a);
    $markers = [...isolationMarkers($this->b, 'Бета-маркер'), $this->a['company']->name];
    $leaks = [];
    $checked = 0;

    foreach (isolationRoutes() as [$method, $path, $names]) {
        if ($method !== 'GET' || in_array('token', $names, true) || in_array('path', $names, true) || str_starts_with($path, '/sanctum') || $path === '/up') {
            continue;
        }

        $uri = isolationPath($path, $params);
        $response = $this->getJson($uri);
        $content = isolationContent($response);
        $checked++;
        // Администратору A (все права в A) свои списки открыты: ответ с ошибкой маркеров не содержит и ничего не доказывал бы
        if ($who === 'admin' && $response->getStatusCode() >= 400 && ! in_array($path, OWNER_ONLY_GET_ROUTES, true)) {
            $leaks[] = "{$uri}: ответ {$response->getStatusCode()}";
        }
        foreach ($markers as $marker) {
            if (str_contains($content, $marker)) {
                $leaks[] = "{$uri}: «{$marker}»";
            }
        }
    }

    expect($checked)->toBeGreaterThan(30)
        ->and($leaks)->toBe([]);
})->with(['admin', 'editor']);

it('(б) журнал: события без компании о людях другой компании и системные не видны администратору компании', function () {
    $events = app(EventRecorder::class);
    $ownEvent = $events->record(EventType::LoginSucceeded, $this->a['editor'], $this->a['editor']);
    $foreign = [
        $events->record(EventType::LoginSucceeded, $this->b['editor'], $this->b['editor'])->id,
        $events->record(EventType::PasswordChanged, $this->b['admin'], $this->b['admin'])->id,
    ];
    // Неудачный вход с неизвестным email: человека нет — системное событие
    $system = $events->record(EventType::LoginFailed, null, null, ['reason' => 'unknown_email'], attemptedEmail: 'nobody@selen.test')->id;
    $journal = fn (User $actor, Company $company) => collect($this->actingAs($actor)->getJson(adminPath($company).'events?page=1')
        ->assertOk()->json('data'))->pluck('id');

    $seenByA = $journal($this->a['admin'], company());
    expect($seenByA)->toContain($ownEvent->id)
        ->not->toContain($system)
        ->and($seenByA->intersect($foreign)->all())->toBe([]);

    $seenByB = $journal($this->b['admin'], $this->b['company']);
    expect($seenByB->intersect($foreign)->values()->all())->toEqualCanonicalizing($foreign)
        ->and($seenByB)->not->toContain($ownEvent->id)->not->toContain($system);

    // Системные события — только Владельцу
    expect($journal(owner(), company()))->toContain($system)->toContain($ownEvent->id);
});

it('(в) ссылки на объекты другой компании в теле запроса — 422, как на несуществующие', function () {
    $a = $this->a;
    $b = $this->b;
    $this->actingAs($a['admin']);
    $card = "/api/v1/cards/{$a['card']->key()}";
    $mention = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'mention', 'attrs' => ['id' => $b['editor']->id]]]]]];

    $requests = [
        ['POST', "/api/v1/spaces/{$a['space']->key}/members", ['user_id' => $b['editor']->id, 'role' => 'editor'], 'user_id'],
        ['POST', "/api/v1/spaces/{$a['space']->key}/groups", ['group_id' => $b['group']->id, 'role' => 'commenter'], 'group_id'],
        ['POST', adminPath()."groups/{$a['group']->id}/members", ['user_id' => $b['editor']->id], 'user_id'],
        ['POST', adminPath().'spaces', ['name' => 'Новое', 'key' => 'NEWONE', 'admin_ids' => [$b['admin']->id]], 'admin_ids.0'],
        ['POST', adminPath().'spaces', ['name' => 'Новое', 'key' => 'NEWTWO', 'parent_id' => $b['folder']->id], 'parent_id'],
        ['POST', adminPath().'folders', ['name' => 'Новая папка', 'parent_id' => $b['folder']->id], 'parent_id'],
        ['POST', adminPath()."nav-nodes/{$a['folder']->id}/move", ['parent_id' => $b['folder']->id], 'parent_id'],
        ['POST', "/api/v1/boards/{$a['board']->id}/cards", ['title' => 'Новая', 'card_type_id' => $b['card_type']->id], 'card_type_id'],
        ['PATCH', $card, ['card_type_id' => $b['card_type']->id], 'card_type_id'],
        ['PATCH', $card, ['responsible_id' => $b['editor']->id], 'responsible_id'],
        ['PATCH', $card, ['description' => $mention], 'description'],
        ['PUT', "{$card}/labels", ['label_ids' => [$b['company_label']->id]], 'label_ids.0'],
        ['PUT', "{$card}/labels", ['label_ids' => [$b['space_label']->id]], 'label_ids.0'],
        ['POST', "{$card}/participants", ['user_id' => $b['editor']->id], 'user_id'],
        ['POST', "{$card}/relations", ['card' => $b['card']->key(), 'kind' => 'child'], 'card'],
        ['POST', "{$card}/blocks", ['blocking_card' => $b['card']->key()], 'blocking_card'],
    ];

    foreach ($requests as [$method, $uri, $body, $field]) {
        $this->json($method, $uri, $body)->assertUnprocessable()->assertJsonValidationErrors($field);
    }
});

it('(в) карточки разных компаний не связать и в обход приложения: триггер связей и блокировок', function () {
    [$a, $b] = [$this->a['card'], $this->b['card']];
    $user = $this->a['admin'];

    // Под ролью приложения, мимо RelatedCardGuard: вставку останавливает триггер БД (append-only не ослаблен).
    // DB::transaction — точка сохранения: ошибка не обрывает транзакцию теста
    expect(fn () => DB::transaction(fn () => makeRelation($a, $b, $user)))->toThrow(QueryException::class, 'cards of different companies cannot be linked')
        ->and(fn () => DB::transaction(fn () => makeBlock($a, $user, $b)))->toThrow(QueryException::class, 'cards of different companies cannot be linked');
});

it('(в) в обход приложения не связать с другой компанией: состав группы, личная выдача, метка и тип карточки', function () {
    $stranger = $this->b['editor'];
    $link = 'a link to another company is not allowed';

    expect(fn () => DB::transaction(fn () => addToGroup($this->a['group'], $stranger)))->toThrow(QueryException::class, $link)
        ->and(fn () => DB::transaction(fn () => addToSpace($this->a['space'], $stranger, SpaceRole::Editor)))->toThrow(QueryException::class, $link)
        ->and(fn () => DB::transaction(fn () => DB::table('card_labels')->insert(['card_id' => $this->a['card']->id, 'label_id' => $this->b['company_label']->id])))
        ->toThrow(QueryException::class, $link)
        ->and(fn () => DB::transaction(fn () => $this->a['card']->forceFill(['card_type_id' => $this->b['card_type']->id])->save()))
        ->toThrow(QueryException::class, $link);

    // Своя компания — можно; Владелец — участник всех компаний: выдача ему в компании B проходит и без «дома» в ней
    DB::transaction(fn () => addToSpace($this->b['space'], owner(), SpaceRole::Commenter));
    DB::table('card_labels')->insert(['card_id' => $this->a['card']->id, 'label_id' => $this->a['company_label']->id]);
    expect(DB::table('card_labels')->where('card_id', $this->a['card']->id)->count())->toBe(1);
});

it('(в) человек с «домами» в двух компаниях не связывает их карточки и не упоминает людей другой компании', function () {
    $both = member(company: $this->a['company']);
    $both->companies()->attach($this->b['company']->id, ['kind' => 'home']);
    addToSpace($this->a['space'], $both, SpaceRole::Editor);
    addToSpace($this->b['space'], $both, SpaceRole::Editor);
    $this->actingAs($both);
    $card = "/api/v1/cards/{$this->a['card']->key()}";

    $this->postJson("{$card}/relations", ['card' => $this->b['card']->key(), 'kind' => 'child'])->assertUnprocessable();
    $this->postJson("{$card}/blocks", ['blocking_card' => $this->b['card']->key()])->assertUnprocessable();
    $this->patchJson($card, ['description' => richText(['mention' => $this->b['editor']->id])])->assertUnprocessable();
    // Свои пространства обеих компаний он видит — в дереве под заголовками компаний
    $this->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertOk();
    $this->getJson("/api/v1/spaces/{$this->b['space']->key}")->assertOk();
    expect(collect($this->getJson('/api/v1/navigation')->assertOk()->json('data'))->pluck('name')->all())
        ->toBe(['Компания Альфа-имя', 'Компания Бета-маркер']);
});

it('(г) выдача и группа человеку без «дома» в компании ничего не дают', function () {
    // Человек был «домом» A, получил личную выдачу и группу, затем «дом» в A пропал (в обход приложения; «убрать
    // из компании» — П2c, отдельный тест ниже): строки выдачи и состава остались, но ничего не дают
    $stranger = $this->b['editor'];
    $stranger->companies()->attach(company()->id, ['kind' => 'home']);
    addToSpace($this->a['space'], $stranger, SpaceRole::Admin);
    addToGroup($this->a['group'], $stranger);
    $stranger->companies()->detach(company()->id);

    $this->actingAs($stranger);
    $this->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertNotFound();
    $this->getJson("/api/v1/cards/{$this->a['card']->key()}")->assertNotFound();
    expect(collect($this->getJson('/api/v1/spaces')->json('data'))->pluck('key'))->not->toContain('ALFA')
        ->and(json_encode($this->getJson('/api/v1/navigation')->json(), JSON_UNESCAPED_UNICODE))->not->toContain('Альфа-маркер');

    // В «Людях» пространства A его нет
    $this->actingAs($this->a['admin']);
    expect(collect($this->getJson("/api/v1/spaces/{$this->a['space']->key}/members")->json('data'))->pluck('user.id'))
        ->not->toContain($stranger->id);
});

it('(г) «Все сотрудники» компании открывают пространство только её людям', function () {
    grantGroup($this->a['space'], Group::everyone(company()), SpaceRole::Commenter);
    [$inA, $inB] = [Group::everyone(company())->membersCount(), Group::everyone($this->b['company'])->membersCount()];
    $mine = member();

    $this->actingAs($mine)->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertOk();
    $this->actingAs($this->b['editor'])->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertNotFound();
    // Число людей «Все сотрудники» — активные «дома» своей компании: новый человек A не прибавляется к B
    expect(Group::everyone(company())->membersCount())->toBe($inA + 1)
        ->and(Group::everyone($this->b['company'])->membersCount())->toBe($inB);
});

it('(г) администратор другой компании не управляет людьми и справочниками компании A', function () {
    $this->actingAs($this->b['admin']);

    $this->getJson(adminPath().'users')->assertNotFound()->assertExactJson(['message' => __('selen.not_found')]);
    $this->postJson(adminPath()."users/{$this->a['editor']->id}/deactivate")->assertNotFound();
    $this->postJson(adminPath(Company::query()->whereKey($this->b['company']->id)->sole())."users/{$this->a['editor']->id}/deactivate")->assertNotFound();
    $this->getJson('/api/v1/companies/'.company()->id.'/users/directory')->assertNotFound();
    $this->patchJson("/api/v1/labels/{$this->a['company_label']->id}", ['name' => 'Чужая'])->assertNotFound();
    expect($this->a['editor']->fresh()->isActive())->toBeTrue();
});

/*
| (д) Гость (П2c): у гостя нет ничего, кроме выданных пространств. Гость компании A («дом» — в B) с личной ролью
| в отдельном пространстве GUEST: каждый маршрут с остальными объектами A — 404 с единым телом (как у человека другой
| компании); ответы маршрутов без объектов в адресе и маршрутов его пространства — без людей, пространств, папок, групп,
| досок и карточек A. Справочники компании (типы карточек, общие метки) в его пространстве видны — так задумано, их
| ответы в проверку маркеров не входят. Название A он видит в дереве: у него две компании (решение PM 23.10, вопрос 4д).
*/

it('(д) у гостя нет ничего, кроме выданных пространств', function () {
    $guest = User::factory()->inCompany($this->b['company'])->guestIn(company())
        ->create(['name' => 'Гость', 'email' => 'guest@selen.test']);
    $host = member(['name' => 'Хозяин гостевого', 'email' => 'host@selen.test']);
    $space = space(['key' => 'GUEST', 'name' => 'Гостевое', 'company_id' => company()->id]);
    addToSpace($space, $host, SpaceRole::Admin);
    addToSpace($space, $guest, SpaceRole::Editor);
    // В своей компании B он тоже работает — тогда в дереве две компании, с названиями
    addToSpace($this->b['space'], $guest, SpaceRole::Commenter);
    // Группа компании-хозяина с доступом к его пространству: гостю — без названия (решение PM 28.10 по аудиту П2c-1)
    $hostGroup = addToGroup(makeGroup(['name' => 'Группа хозяина', 'description' => 'Описание группы хозяина']), $host);
    grantGroup($space, $hostGroup, SpaceRole::Commenter);
    $board = makeBoard($space, $host, BoardTemplate::Simple, 'Гостевая доска');
    $card = makeCard($board, 'Review', $host, 'Гостевая карточка');
    $this->actingAs($guest);

    // Каждый маршрут с объектами A (не его пространства) — 404, как несуществующий
    $paramsA = isolationParams($this->a);
    $failures = [];
    $checked = 0;
    foreach (isolationRoutes() as [$method, $path, $names]) {
        if ($names === [] || $names === ['token'] || $names === ['path']) {
            continue;
        }
        $uri = isolationPath($path, $paramsA);
        $response = $this->json($method, $uri, []);
        $checked++;
        if ($response->status() !== 404 || $response->json() !== ['message' => __('selen.not_found')]) {
            $failures[] = "{$method} {$uri}: {$response->status()} ".mb_substr(isolationContent($response), 0, 200);
        }
    }
    expect($checked)->toBeGreaterThan(100)->and($failures)->toBe([]);

    // Ответы без объектов в адресе и маршрутов его пространства — без людей и содержимого A
    $a = $this->a;
    // Люди компании-хозяина в его пространстве — только по имени (без email), группы — без названий (решение PM 28.10)
    $markers = [
        'Альфа-маркер', 'ALFA-', $a['admin']->email, $a['editor']->email, $a['invited']->email,
        $a['space']->id, $a['board']->id, $a['card']->id, $a['folder']->id, $a['group']->id, $a['invited']->id,
        $host->email, 'Группа хозяина', 'Описание группы хозяина',
    ];
    $params = ['{space}' => 'GUEST', '{board}' => $board->id, '{column}' => columnNamed($board, 'Review')->id,
        '{lane}' => firstLane($board)->id, '{card}' => $card->key()];
    $leaks = [];
    foreach (isolationRoutes() as [$method, $path, $names]) {
        $dictionary = str_ends_with($path, '/card-types') || str_ends_with($path, '/labels');
        if ($method !== 'GET' || $dictionary || array_diff($names, ['space', 'board', 'column', 'lane', 'card']) !== []
            || str_starts_with($path, '/sanctum') || $path === '/up' || str_starts_with($path, 'admin/')) {
            continue;
        }
        $response = $this->getJson(isolationPath($path, $params));
        foreach ($markers as $marker) {
            if (str_contains(isolationContent($response), $marker)) {
                $leaks[] = "{$path}: «{$marker}»";
            }
        }
    }
    expect($leaks)->toBe([]);

    // Люди и группы — видны, но без email и названий; свой email гость видит
    $people = collect($this->getJson('/api/v1/spaces/GUEST/members')->assertOk()->json('data'))->keyBy('user.id');
    expect($people[$host->id]['user'])->toMatchArray(['name' => 'Хозяин гостевого', 'email' => null])
        ->and($people[$host->id]['groups'][0]['name'])->toBeNull()
        ->and($people[$guest->id]['user']['email'])->toBe('guest@selen.test');
    // И «Все сотрудники» хозяина — просто «группа»: без пометки встроенной и численности компании (LATER-139)
    grantGroup($space, Group::everyone(company()), SpaceRole::Commenter);
    foreach ($this->getJson('/api/v1/spaces/GUEST/groups')->assertOk()->json('data') as $grant) {
        expect($grant['group'])->toMatchArray(['name' => null, 'description' => null, 'system' => null, 'members_count' => null]);
    }

    // Его пространство работает; в дереве — его «дом» и гостевое пространство под названием A; админки A нет
    $this->getJson('/api/v1/spaces/GUEST')->assertOk()->assertJsonPath('data.my_role', 'editor');
    $trees = collect($this->getJson('/api/v1/navigation')->assertOk()->json('data'));
    expect($trees->pluck('name')->all())->toContain('Компания Альфа-имя', 'Компания Бета-маркер')
        ->and(flatTree($trees->firstWhere('name', 'Компания Альфа-имя')['items']))->toBe(['GUEST'])
        ->and($this->getJson('/api/v1/auth/me')->json('data.admin_companies'))->toBe([]);
});

it('(д) гостю истёк срок — пространства компании пропадают сами; продлили — возвращаются', function () {
    $guest = User::factory()->inCompany($this->b['company'])->guestIn(company(), now()->addDays(3))->create();
    addToSpace($this->a['space'], $guest, SpaceRole::Commenter);
    $this->actingAs($guest);

    $this->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertOk();
    $this->travel(4)->days();
    $this->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertNotFound();
    $this->getJson("/api/v1/cards/{$this->a['card']->key()}")->assertNotFound();
    expect(collect($this->getJson('/api/v1/navigation')->json('data'))->pluck('name'))->not->toContain('Компания Альфа-имя');

    $this->actingAs($this->a['admin'])->putJson(adminPath()."guests/{$guest->id}", [
        'expires_on' => now()->addDays(10)->format('Y-m-d'),
        'spaces' => [['space_id' => $this->a['space']->id, 'role' => 'commenter']],
    ])->assertOk();
    $this->actingAs($guest)->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertOk();
});

it('(д) гостю нельзя: группы, «Все сотрудники», права компании, роль с управлением доступом', function () {
    $guest = User::factory()->inCompany($this->b['company'])->guestIn(company())->create();
    addToSpace($this->a['space'], $guest, SpaceRole::Commenter);
    grantGroup($this->a['space'], Group::everyone(company()), SpaceRole::Editor);
    $this->actingAs($this->a['admin']);

    // Группа — только «дома»: гостя нет в справочнике и в составе
    expect(collect($this->getJson('/api/v1/companies/'.company()->id.'/users/directory?search=')->json('data'))->pluck('id'))
        ->not->toContain($guest->id);
    $this->postJson(adminPath()."groups/{$this->a['group']->id}/members", ['user_id' => $guest->id])->assertUnprocessable();
    // Роль с управлением доступом — 422; права компании — 403
    $this->patchJson("/api/v1/spaces/{$this->a['space']->key}/members/{$guest->id}", ['role' => 'admin'])
        ->assertUnprocessable()->assertJsonValidationErrors(['role' => __('selen.guests.no_manage_access')]);
    $this->putJson(adminPath()."users/{$guest->id}/permissions", ['permissions' => ['company.invite_users']])->assertForbidden();

    // «Все сотрудники» (Редактор) гостю не добавляет: роль — его личная (Комментатор)
    $this->actingAs($guest)->getJson("/api/v1/spaces/{$this->a['space']->key}")->assertOk()->assertJsonPath('data.my_role', 'commenter');

    // И в обход приложения — БД не даёт
    expect(fn () => DB::transaction(fn () => addToGroup($this->a['group'], $guest)))->toThrow(QueryException::class, 'another company')
        ->and(fn () => DB::transaction(fn () => addToSpace(space(['key' => 'GADM']), $guest, SpaceRole::Admin)))
        ->toThrow(QueryException::class, 'a guest gets only')
        ->and(fn () => DB::transaction(fn () => $guest->companies()->newPivotStatement()->where('user_id', $guest->id)
            ->where('company_id', company()->id)->update(['is_admin' => true])))
        ->toThrow(QueryException::class, 'company_members_admin_check')
        ->and(fn () => DB::transaction(fn () => CompanyPermissionGrant::query()->forceCreate([
            'company_id' => company()->id, 'user_id' => $guest->id, 'permission' => 'company.invite_users',
        ])))->toThrow(QueryException::class, 'another company');
});
