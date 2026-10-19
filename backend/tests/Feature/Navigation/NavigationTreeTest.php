<?php

use App\Enums\SpaceRole;
use App\Models\Group;
use Illuminate\Support\Facades\DB;

/*
| Дерево навигации пользователя — GET /navigation (ADR-0013): папки не дают доступа, видна только папка
| с доступным пространством на любой глубине; названия прочих папок не уходят в ответ; значок «доступно всем».
*/

beforeEach(function () {
    $this->admin = admin();
    $this->user = member();
});

it('показывает только папки с доступными пространствами на любой глубине', function () {
    $mobile = makeFolder('Mobile');
    $apple = makeFolder('Apple', $mobile);
    $secret = makeFolder('Секретная папка');
    $empty = makeFolder('Пустая');

    $ios = space(['key' => 'IOS', 'name' => 'iOS']);
    $android = space(['key' => 'AND', 'name' => 'Android']);
    $hidden = space(['key' => 'HID', 'name' => 'Скрытое']);
    $front = space(['key' => 'FRONT', 'name' => 'Frontend']);
    placeIn(nodeOf($ios), $apple);
    placeIn(nodeOf($android), $mobile);
    placeIn(nodeOf($hidden), $secret);

    addToSpace($ios, $this->user, SpaceRole::Commenter);
    addToSpaceViaGroup($front, $this->user, SpaceRole::Editor);

    $response = $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk();

    expect(flatTree($response->json('data')))->toBe(['[Mobile]', '  [Apple]', '    IOS', 'FRONT']);

    // Названий недоступных папок и пространств нет в ответе
    $body = $response->getContent();
    foreach (['Секретная папка', 'Пустая', 'Скрытое', 'Android'] as $text) {
        expect($body)->not->toContain($text);
    }
    expect($body)->not->toContain($secret->id)->not->toContain($empty->id);
});

it('у пространства — можно ли им управлять (создать доску): только у администратора пространства', function () {
    $own = space(['key' => 'OWN']);
    $read = space(['key' => 'READ']);
    $group = space(['key' => 'GRP']);
    addToSpace($own, $this->user, SpaceRole::Admin);
    addToSpace($read, $this->user, SpaceRole::Editor);
    addToSpaceViaGroup($group, $this->user, SpaceRole::Admin);

    $tree = $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk()->json('data');

    expect(collect($tree)->pluck('can_manage', 'space.key')->all())
        ->toBe(['OWN' => true, 'READ' => false, 'GRP' => true]);
});

it('пустая папка не видна в дереве ни системному администратору, ни сотруднику; в «Структуре» — видна', function () {
    $empty = makeFolder('Пустая');
    makeFolder('Вложенная пустая', $empty);
    $mixed = makeFolder('Смешанная');
    $old = space(['key' => 'OLD', 'archived_at' => now()]);
    $own = space(['key' => 'OWN', 'name' => 'Своё']);
    placeIn(nodeOf($old), $empty);
    placeIn(nodeOf($own), $mixed);
    addToSpace($own, $this->admin, SpaceRole::Admin);
    addToSpace($own, $this->user, SpaceRole::Editor);

    foreach ([$this->admin, $this->user] as $viewer) {
        $response = $this->actingAs($viewer)->getJson('/api/v1/navigation')->assertOk();
        expect(flatTree($response->json('data')))->toBe(['[Смешанная]', '  OWN'])
            ->and($response->getContent())->not->toContain('Пустая')->not->toContain('"empty":true');
    }

    $structure = collect($this->actingAs($this->admin)->getJson('/api/v1/admin/navigation')->json('data'));
    expect($structure->pluck('name')->filter()->values()->all())->toBe(['Пустая', 'Вложенная пустая', 'Смешанная']);
});

it('показывает пространство без досок, под пространством — его активные доски по порядку', function () {
    $space = space(['key' => 'NEW']);
    addToSpace($space, $this->user, SpaceRole::Admin);

    $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk()
        ->assertJsonPath('data.0.space.key', 'NEW')
        ->assertJsonPath('data.0.boards', []);

    $first = makeBoard($space, $this->user, name: 'Первая');
    $second = makeBoard($space, $this->user, name: 'Вторая');
    makeBoard($space, $this->user, name: 'Архивная')->forceFill(['archived_at' => now()])->save();

    $this->getJson('/api/v1/navigation')->assertOk()
        ->assertJsonPath('data.0.boards', [['id' => $first->id, 'name' => 'Первая'], ['id' => $second->id, 'name' => 'Вторая']]);
});

it('скрывает архивные пространства и архивные папки', function () {
    $folder = makeFolder('Архив 2025');
    $old = space(['key' => 'OLD', 'archived_at' => now()]);
    placeIn(nodeOf($old), $folder);
    addToSpace($old, $this->user, SpaceRole::Admin);
    $folder->forceFill(['archived_at' => now()])->save();

    $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk()->assertExactJson(['data' => []]);
});

it('порядок узлов — по позициям, иконки отдаются', function () {
    $b = space(['key' => 'BBB', 'name' => 'Б']);
    $a = space(['key' => 'AAA', 'name' => 'А']);
    nodeOf($a)->forceFill(['icon' => '📦'])->save();
    $folder = makeFolder('Папка', icon: '💡');
    placeIn(nodeOf($a), $folder);
    addToSpace($a, $this->user, SpaceRole::Commenter);
    addToSpace($b, $this->user, SpaceRole::Commenter);

    $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk()
        ->assertJsonPath('data.0.space.key', 'BBB')
        ->assertJsonPath('data.0.icon', null)
        ->assertJsonPath('data.1.name', 'Папка')
        ->assertJsonPath('data.1.icon', '💡')
        ->assertJsonPath('data.1.children.0.icon', '📦');
});

it('системному администратору — те же правила: только папки с доступными ему пространствами', function () {
    $operations = makeFolder('Операции');
    $marketing = space(['key' => 'MKT', 'name' => 'Маркетинг']);
    placeIn(nodeOf($marketing), $operations);
    $empty = makeFolder('Пустая папка');
    $own = space(['key' => 'OWN', 'name' => 'Своё']);
    addToSpace($own, $this->admin, SpaceRole::Admin);

    $response = $this->actingAs($this->admin)->getJson('/api/v1/navigation')->assertOk();

    expect(flatTree($response->json('data')))->toBe(['OWN']);
    foreach (['Операции', 'Маркетинг', 'MKT', 'Пустая папка', $operations->id, $empty->id] as $text) {
        expect($response->getContent())->not->toContain($text);
    }

    // Полная структура со всеми названиями — только в «Структуре»
    $structure = $this->getJson('/api/v1/admin/navigation')->assertOk()->json('data');
    expect(collect($structure)->pluck('name')->filter()->values()->all())->toBe(['Операции', 'Пустая папка']);
});

it('Владельцу видны по-настоящему пустые папки на любой глубине — с пометкой empty', function () {
    $owner = owner();
    $empty = makeFolder('Пустая');
    $nested = makeFolder('Вложенная пустая', $empty);
    $mixed = makeFolder('Смешанная');
    $inMixed = makeFolder('Пустая внутри', $mixed);
    $own = space(['key' => 'OWN', 'name' => 'Своё']);
    placeIn(nodeOf($own), $mixed);
    addToSpace($own, $owner, SpaceRole::Admin);

    $tree = $this->actingAs($owner)->getJson('/api/v1/navigation')->assertOk()->json('data');

    expect(flatTree($tree))->toBe(['[Пустая]', '  [Вложенная пустая]', '[Смешанная]', '  [Пустая внутри]', '  OWN'])
        ->and($tree[0])->toMatchArray(['id' => $empty->id, 'empty' => true])
        ->and($tree[0]['children'][0])->toMatchArray(['id' => $nested->id, 'empty' => true, 'children' => []])
        ->and($tree[1])->toMatchArray(['id' => $mixed->id, 'empty' => false])
        ->and($tree[1]['children'][0])->toMatchArray(['id' => $inMixed->id, 'empty' => true]);

    // Обычному администратору и сотруднику пустые папки не приходят (ADR-0013)
    foreach ([$this->admin, $this->user] as $viewer) {
        $response = $this->actingAs($viewer)->getJson('/api/v1/navigation')->assertOk();
        expect($response->getContent())->not->toContain('Пустая')->not->toContain('"empty":true');
    }
});

it('Владелец не видит папку с архивным пространством и папку с недоступными пространствами — даже пустую внутри', function () {
    $owner = owner();
    // Архивное пространство на любой глубине (и в архивной папке) — папка не пустая
    $withArchived = makeFolder('С архивом');
    $archivedFolder = makeFolder('Архив внутри', $withArchived);
    $old = space(['key' => 'OLD', 'archived_at' => now()]);
    placeIn(nodeOf($old), $archivedFolder);
    $archivedFolder->forceFill(['archived_at' => now()])->save();
    // Недоступное пространство: папка скрыта целиком, вместе с пустой вложенной
    $secret = makeFolder('Секретная');
    makeFolder('Пустая в секретной', $secret);
    placeIn(nodeOf(space(['key' => 'HR', 'name' => 'Кадры'])), $secret);

    $response = $this->actingAs($owner)->getJson('/api/v1/navigation')->assertOk();

    expect($response->json('data'))->toBe([]);
    foreach (['С архивом', 'Архив внутри', 'Секретная', 'Пустая в секретной', 'Кадры', 'HR', $secret->id] as $text) {
        expect($response->getContent())->not->toContain($text);
    }
});

it('Владелец, как и администратор, не получает доступа к пространству без роли — в дереве его нет', function () {
    $owner = owner();
    $folder = makeFolder('Команды');
    placeIn(nodeOf(space(['key' => 'DEV'])), $folder);

    $this->actingAs($owner)->getJson('/api/v1/navigation')->assertOk()->assertExactJson(['data' => []]);
    $this->getJson('/api/v1/spaces/DEV')->assertNotFound();
});

it('значок «доступно всем»: у пространства — доступ группы «Все сотрудники», у папки — все её активные пространства', function () {
    $everyone = Group::everyone();
    $root = makeFolder('Компания');
    $inner = makeFolder('Отделы', $root);
    $open1 = space(['key' => 'OPENA']);
    $open2 = space(['key' => 'OPENB']);
    $private = space(['key' => 'PRIV']);
    $archivedPrivate = space(['key' => 'ARCH', 'archived_at' => now()]);
    placeIn(nodeOf($open1), $root);
    placeIn(nodeOf($open2), $inner);
    placeIn(nodeOf($archivedPrivate), $inner);
    grantGroup($open1, $everyone, SpaceRole::Commenter);
    grantGroup($open2, $everyone, SpaceRole::Editor, ownCardsOnly: true);

    $tree = fn () => $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk()->json('data');

    // Все активные пространства папок открыты всем (архивное не считается)
    $data = $tree();
    [$innerNode, $openNode] = $data[0]['children'];
    expect(flatTree($data))->toBe(['[Компания]', '  [Отделы]', '    OPENB', '  OPENA'])
        ->and($data[0]['everyone'])->toBeTrue()
        ->and($innerNode['everyone'])->toBeTrue()
        ->and($innerNode['children'][0]['everyone'])->toBeTrue()
        ->and($openNode['everyone'])->toBeTrue();

    // Закрытое пространство в подпапке: значок пропадает у подпапки и у родительской папки, хотя пользователю
    // закрытое пространство не видно
    placeIn(nodeOf($private), $inner);
    $data = $tree();
    [$innerNode, $openNode] = $data[0]['children'];
    expect(flatTree($data))->toBe(['[Компания]', '  [Отделы]', '    OPENB', '  OPENA'])
        ->and($data[0]['everyone'])->toBeFalse()
        ->and($innerNode['everyone'])->toBeFalse()
        ->and($openNode['everyone'])->toBeTrue();
});

it('у папки без активных пространств значка «доступно всем» нет', function () {
    $folder = makeFolder('Только архив');
    $space = space(['archived_at' => now()]);
    placeIn(nodeOf($space), $folder);
    grantGroup($space, Group::everyone(), SpaceRole::Commenter);
    $this->actingAs(admin());

    $node = collect($this->getJson('/api/v1/admin/navigation')->assertOk()->json('data'))->firstWhere('id', $folder->id);
    expect($node['everyone'])->toBeFalse();
});

it('число запросов не зависит от числа папок, пространств и досок', function () {
    $count = function () {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->user)->getJson('/api/v1/navigation')->assertOk();
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $queries;
    };

    $add = function (int $n) {
        foreach (range(1, $n) as $i) {
            $folder = makeFolder('Папка '.uniqid());
            $space = space();
            placeIn(nodeOf($space), makeFolder('Вложенная '.uniqid(), $folder));
            addToSpaceViaGroup($space, $this->user, SpaceRole::Commenter);
            makeBoard($space, admin());
            grantGroup($space, Group::everyone(), SpaceRole::Commenter);
        }
    };

    $add(1);
    $count(); // первый запрос теста прогревает служебные запросы (пользователь, сессия)
    $small = $count();
    $add(5);

    expect($count())->toBe($small);
});

it('у Владельца число запросов дерева тоже не зависит от числа пустых папок', function () {
    $owner = owner();
    $count = function () use ($owner) {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($owner)->getJson('/api/v1/navigation')->assertOk();
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $queries;
    };

    makeFolder('Пустая '.uniqid());
    $count();
    $small = $count();
    foreach (range(1, 5) as $i) {
        makeFolder('Вложенная '.uniqid(), makeFolder('Пустая '.uniqid()));
    }

    expect($count())->toBe($small);
});
