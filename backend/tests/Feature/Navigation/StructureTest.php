<?php

use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\EventLogEntry;
use App\Models\NavNode;
use App\Models\Space;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/*
| Админка «Структура» (ADR-0013): папки, иконки, перемещения, архив. Ведёт только системный администратор.
*/

beforeEach(function () {
    $this->admin = admin();
    $this->actingAs($this->admin);
});

/** Дерево админки: id → узел. */
function adminTree($test): Collection
{
    return collect($test->getJson('/api/v1/admin/navigation')->assertOk()->json('data'))->keyBy('id');
}

it('доступна только системному администратору', function (string $method, string $uri) {
    $folder = makeFolder('Папка');
    $user = member();
    addToSpace(space(), $user, SpaceRole::Admin);

    $this->actingAs($user)->json($method, '/api/v1/admin/'.str_replace('{node}', $folder->id, $uri), [
        'name' => 'Новая', 'parent_id' => null,
    ])->assertForbidden();
})->with([
    ['GET', 'navigation'],
    ['POST', 'folders'],
    ['PATCH', 'nav-nodes/{node}'],
    ['POST', 'nav-nodes/{node}/move'],
    ['POST', 'folders/{node}/archive'],
    ['POST', 'folders/{node}/restore'],
    ['DELETE', 'folders/{node}'],
]);

it('создаёт папки в корне и внутри папки, в конец; иконка необязательна', function () {
    $space = space(['key' => 'DEV', 'name' => 'Разработка']);

    $response = $this->postJson('/api/v1/admin/folders', ['name' => '  Mobile ', 'icon' => '📱'])
        ->assertCreated()->assertJsonPath('meta.max_depth', 4);
    $mobileId = $response->json('meta.created_id');
    $innerId = $this->postJson('/api/v1/admin/folders', ['name' => 'Apple', 'parent_id' => $mobileId, 'icon' => ''])
        ->assertCreated()->json('meta.created_id');

    $tree = adminTree($this);
    expect($tree->values()->map(fn ($n) => [$n['type'], $n['name'] ?? $n['space']['key'], $n['depth'], $n['icon']])->all())->toBe([
        ['space', 'DEV', 1, null],
        ['folder', 'Mobile', 1, '📱'],
        ['folder', 'Apple', 2, null],
    ])->and($tree[$innerId]['parent_id'])->toBe($mobileId)
        ->and($tree[nodeOf($space)->id]['space'])->toMatchArray(['key' => 'DEV', 'name' => 'Разработка', 'archived_at' => null]);

    // Порядок строк без ORDER BY PostgreSQL не гарантирует — тест изредка падал
    expect(EventLogEntry::query()->where('event_type', 'folder.created')->orderBy('id')->pluck('payload')->all())
        ->toEqual([['parent_id' => null], ['parent_id' => $mobileId]]);
});

it('проверяет название, иконку и родителя', function () {
    $space = space();
    $archived = makeFolder('Архивная');
    $archived->forceFill(['archived_at' => now()])->save();

    $this->postJson('/api/v1/admin/folders', ['name' => ''])->assertUnprocessable()->assertJsonValidationErrors('name');
    foreach (['a', '📦📦', 'ab', '1', '📦 x'] as $icon) {
        $this->postJson('/api/v1/admin/folders', ['name' => 'Папка', 'icon' => $icon])
            ->assertUnprocessable()->assertJsonValidationErrors(['icon' => 'одна эмодзи']);
    }
    foreach (['👨‍👩‍👧', '👍🏽', '🇷🇺', '❤️'] as $icon) {
        $this->postJson('/api/v1/admin/folders', ['name' => "Папка {$icon}", 'icon' => $icon])->assertCreated();
    }
    $this->postJson('/api/v1/admin/folders', ['name' => 'Папка', 'parent_id' => nodeOf($space)->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['parent_id' => 'активную папку']);
    $this->postJson('/api/v1/admin/folders', ['name' => 'Папка', 'parent_id' => $archived->id])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
});

it('ограничивает глубину папок четырьмя уровнями', function () {
    $level = null;
    foreach (range(1, 4) as $depth) {
        $level = makeFolder("Уровень {$depth}", $level);
    }

    $this->postJson('/api/v1/admin/folders', ['name' => 'Пятый', 'parent_id' => $level->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['parent_id' => 'не больше 4 уровней']);

    // Пространство в папке четвёртого уровня — можно
    $this->postJson('/api/v1/admin/nav-nodes/'.nodeOf(space())->id.'/move', ['parent_id' => $level->id])->assertOk();

    // Папку с вложенной нельзя опустить так, чтобы поддерево стало глубже 4
    $branch = makeFolder('Ветка');
    makeFolder('Лист', $branch);
    $third = NavNode::query()->where('name', 'Уровень 3')->firstOrFail();
    $this->postJson("/api/v1/admin/nav-nodes/{$branch->id}/move", ['parent_id' => $third->id])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
    $second = NavNode::query()->where('name', 'Уровень 2')->firstOrFail();
    $this->postJson("/api/v1/admin/nav-nodes/{$branch->id}/move", ['parent_id' => $second->id])->assertOk();
});

it('переименовывает папку и меняет иконки; название пространства здесь не меняется', function () {
    $folder = makeFolder('Старое');
    $space = space(['name' => 'Пространство']);
    $spaceNode = nodeOf($space);

    $this->patchJson("/api/v1/admin/nav-nodes/{$folder->id}", ['name' => 'Новое', 'icon' => '💡'])->assertOk();
    $this->patchJson("/api/v1/admin/nav-nodes/{$spaceNode->id}", ['icon' => '📦'])->assertOk();
    $this->patchJson("/api/v1/admin/nav-nodes/{$spaceNode->id}", ['icon' => '📦'])->assertOk(); // без изменений
    $this->patchJson("/api/v1/admin/nav-nodes/{$spaceNode->id}", ['name' => 'Другое'])
        ->assertUnprocessable()->assertJsonValidationErrors(['name' => 'в его настройках']);
    $this->patchJson("/api/v1/admin/nav-nodes/{$folder->id}", ['icon' => null])->assertOk();

    expect($folder->fresh())->name->toBe('Новое')->icon->toBeNull()
        ->and($spaceNode->fresh()->icon)->toBe('📦')
        ->and($space->fresh()->name)->toBe('Пространство')
        ->and(EventLogEntry::query()->orderBy('id')->get(['event_type', 'payload'])->map(fn ($e) => [$e->event_type, $e->payload])->all())
        ->toEqual([
            ['folder.created', ['parent_id' => null]],
            ['folder.renamed', []],
            ['nav_node.icon_changed', ['node_id' => $folder->id]],
            ['nav_node.icon_changed', ['node_id' => $spaceNode->id, 'space_id' => $space->id]],
            ['nav_node.icon_changed', ['node_id' => $folder->id]],
        ]);

    $folder->forceFill(['archived_at' => now()])->save();
    $this->patchJson("/api/v1/admin/nav-nodes/{$folder->id}", ['name' => 'Ещё'])
        ->assertUnprocessable()->assertJsonValidationErrors(['node' => 'в архиве']);
});

it('перемещает узлы между папками, в корень и между соседями', function () {
    $mobile = makeFolder('Mobile');
    $ios = nodeOf(space(['key' => 'IOS']));
    $android = nodeOf(space(['key' => 'AND']));
    $front = nodeOf(space(['key' => 'FRONT']));
    $order = fn () => adminTree($this)->values()
        ->map(fn ($n) => str_repeat('  ', $n['depth'] - 1).($n['name'] ?? $n['space']['key']))->all();

    $this->postJson("/api/v1/admin/nav-nodes/{$ios->id}/move", ['parent_id' => $mobile->id])->assertOk();
    $this->postJson("/api/v1/admin/nav-nodes/{$android->id}/move", ['parent_id' => $mobile->id, 'before_id' => $ios->id])->assertOk();
    expect($order())->toBe(['Mobile', '  AND', '  IOS', 'FRONT']);

    // Выше / ниже — перестановка внутри той же папки
    $this->postJson("/api/v1/admin/nav-nodes/{$android->id}/move", ['parent_id' => $mobile->id, 'after_id' => $ios->id])->assertOk();
    $this->postJson("/api/v1/admin/nav-nodes/{$front->id}/move", ['parent_id' => null, 'before_id' => $mobile->id])->assertOk();
    expect($order())->toBe(['FRONT', 'Mobile', '  IOS', '  AND']);

    // В корень
    $this->postJson("/api/v1/admin/nav-nodes/{$android->id}/move", ['parent_id' => null])->assertOk();
    expect($order())->toBe(['FRONT', 'Mobile', '  IOS', 'AND']);

    $moves = EventLogEntry::query()->where('event_type', 'nav_node.moved')->orderBy('id')->pluck('payload');
    expect($moves->last())->toEqual([
        'node_id' => $android->id, 'space_id' => $android->space_id, 'from_parent_id' => $mobile->id, 'to_parent_id' => null,
    ])->and($moves)->toHaveCount(5);

    $this->postJson("/api/v1/admin/nav-nodes/{$android->id}/move", [])->assertUnprocessable()->assertJsonValidationErrors('parent_id');
});

it('не перемещает папку в саму себя и во вложенную, архивные узлы не перемещаются', function () {
    $outer = makeFolder('Внешняя');
    $inner = makeFolder('Внутренняя', $outer);

    $this->postJson("/api/v1/admin/nav-nodes/{$outer->id}/move", ['parent_id' => $outer->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['parent_id' => 'в саму себя']);
    $this->postJson("/api/v1/admin/nav-nodes/{$outer->id}/move", ['parent_id' => $inner->id])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');

    $archivedSpace = space(['archived_at' => now()]);
    $this->postJson('/api/v1/admin/nav-nodes/'.nodeOf($archivedSpace)->id.'/move', ['parent_id' => $outer->id])
        ->assertUnprocessable()->assertJsonValidationErrors(['node' => 'восстановите']);

    $inner->forceFill(['archived_at' => now()])->save();
    $this->postJson("/api/v1/admin/nav-nodes/{$inner->id}/move", ['parent_id' => null])
        ->assertUnprocessable()->assertJsonValidationErrors('node');
    $this->postJson('/api/v1/admin/nav-nodes/'.nodeOf(space())->id.'/move', ['parent_id' => $inner->id])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
});

it('перемещение не меняет ключ, номера карточек, историю, метрики и доступы', function () {
    $mobile = makeFolder('Mobile');
    $space = space(['key' => 'AND', 'name' => 'Android']);
    $owner = member();
    addToSpace($space, $owner, SpaceRole::Admin);
    $viewer = member();
    $group = addToSpaceViaGroup($space, $viewer, SpaceRole::Commenter);
    $node = placeIn(nodeOf($space), $mobile);
    $board = makeBoard($space, $owner);
    $card = makeCard($board, 'To Do', $owner, 'Карточка');
    moveCard($card, 'In Progress', $owner);

    $snapshot = fn () => [
        DB::table('spaces')->where('id', $space->id)->first(['key', 'name', 'last_card_number', 'archived_at']),
        DB::table('cards')->where('space_id', $space->id)->orderBy('number')->get(['id', 'number', 'board_id', 'column_id', 'position']),
        DB::table('card_transitions')->where('card_id', $card->id)->orderBy('id')->get(),
        AccessGrant::query()->onSpace($space)->orderBy('id')->get(['user_id', 'group_id', 'role_id'])->toArray(),
        DB::table('event_log')->where('subject_type', 'card')->orderBy('id')->get(['id', 'event_type', 'payload']),
    ];
    $before = $snapshot();

    $this->postJson("/api/v1/admin/nav-nodes/{$node->id}/move", ['parent_id' => null])->assertOk();

    expect($snapshot())->toEqual($before)
        ->and($group->fresh()->archived_at)->toBeNull();
    $this->actingAs($viewer)->getJson('/api/v1/cards/AND-1')->assertOk()->assertJsonPath('data.key', 'AND-1');
    $this->getJson('/api/v1/navigation')->assertOk()->assertJsonPath('data.0.space.key', 'AND');
});

it('архивирует только папку без активного содержимого', function () {
    $folder = makeFolder('Mobile');
    $sub = makeFolder('Apple', $folder);
    $ios = space(['key' => 'IOS', 'name' => 'iOS']);
    placeIn(nodeOf($ios), $folder);

    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertUnprocessable()
        ->assertJsonValidationErrors(['node' => 'Сначала перенесите содержимое папки: Apple, iOS.']);

    // Архивные пространство и папка не мешают и остаются внутри
    $ios->forceFill(['archived_at' => now()])->save();
    $this->postJson("/api/v1/admin/folders/{$sub->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertUnprocessable()->assertJsonValidationErrors('node');

    $tree = adminTree($this);
    expect($tree[$folder->id]['archived_at'])->not->toBeNull()
        ->and($tree[$sub->id]['parent_id'])->toBe($folder->id)
        ->and($tree[nodeOf($ios)->id]['parent_id'])->toBe($folder->id);

    // Узел пространства — не папка: 404
    $this->postJson('/api/v1/admin/folders/'.nodeOf($ios)->id.'/archive')->assertNotFound();
});

it('восстанавливает папку на место, а если родитель в архиве — в корень', function () {
    $outer = makeFolder('Внешняя');
    $inner = makeFolder('Внутренняя', $outer);
    $this->postJson("/api/v1/admin/folders/{$inner->id}/archive")->assertOk();

    $this->postJson("/api/v1/admin/folders/{$inner->id}/restore")->assertOk();
    expect($inner->fresh()->parent_id)->toBe($outer->id);

    $this->postJson("/api/v1/admin/folders/{$inner->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$outer->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$inner->id}/restore")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$inner->id}/restore")->assertUnprocessable()->assertJsonValidationErrors('node');

    expect($inner->fresh())->parent_id->toBeNull()->archived_at->toBeNull()
        ->and(EventLogEntry::query()->where('event_type', 'folder.restored')->orderBy('id')->pluck('payload')->all())
        ->toEqual([['parent_id' => $outer->id], ['parent_id' => null]]);
});

it('восстанавливает папку с архивными пространствами внутри — только по галочке', function () {
    $folder = makeFolder('Старые проекты');
    $inner = makeFolder('Ещё старее', $folder);
    [$one, $two, $deep] = [space(['key' => 'ONE']), space(['key' => 'TWO']), space(['key' => 'DEEP'])];
    placeIn(nodeOf($one), $folder);
    placeIn(nodeOf($two), $folder);
    placeIn(nodeOf($deep), $inner);
    foreach ([$one, $two, $deep] as $space) {
        $this->postJson("/api/v1/admin/spaces/{$space->id}/archive")->assertOk();
    }
    $this->postJson("/api/v1/admin/folders/{$inner->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertOk();

    // Без галочки — только папка, пространства остаются в архиве внутри неё
    $this->postJson("/api/v1/admin/folders/{$folder->id}/restore")->assertOk();
    expect($folder->fresh()->archived_at)->toBeNull()
        ->and([$one->fresh()->archived_at, $two->fresh()->archived_at])->each->not->toBeNull();

    // С галочкой — и пространства прямо в папке, на своих местах; во вложенной архивной папке — нет
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/restore", ['restore_spaces' => true])->assertOk();

    $tree = adminTree($this);
    expect($one->fresh()->archived_at)->toBeNull()
        ->and($two->fresh()->archived_at)->toBeNull()
        ->and($deep->fresh()->archived_at)->not->toBeNull()
        ->and($tree[nodeOf($one)->id]['parent_id'])->toBe($folder->id)
        ->and($tree[nodeOf($two)->id]['parent_id'])->toBe($folder->id)
        ->and(EventLogEntry::query()->where('event_type', 'space.restored')->pluck('subject_id')->sort()->values()->all())
        ->toEqual(collect([$one->id, $two->id])->sort()->values()->all())
        ->and(EventLogEntry::query()->where('event_type', 'nav_node.moved')->count())->toBe(0);

    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive", [])->assertUnprocessable();
    $this->postJson("/api/v1/admin/folders/{$inner->id}/restore", ['restore_spaces' => 'да'])
        ->assertUnprocessable()->assertJsonValidationErrors('restore_spaces');
});

it('восстановленное пространство из архивной папки возвращается в корень', function () {
    $folder = makeFolder('Архив');
    $space = space(['key' => 'OLD']);
    placeIn(nodeOf($space), $folder);
    $this->postJson("/api/v1/admin/spaces/{$space->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertOk();

    $this->postJson("/api/v1/admin/spaces/{$space->id}/restore")->assertOk();

    expect(nodeOf($space)->parent_id)->toBeNull()
        ->and(EventLogEntry::query()->where('event_type', 'nav_node.moved')->sole()->payload)->toEqual([
            'node_id' => nodeOf($space)->id, 'space_id' => $space->id, 'from_parent_id' => $folder->id,
            'to_parent_id' => null, 'via' => 'space_restored',
        ]);

    // Пространство из активной папки остаётся на месте
    $active = makeFolder('Активная');
    placeIn(nodeOf($space), $active);
    $this->postJson("/api/v1/admin/spaces/{$space->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/spaces/{$space->id}/restore")->assertOk();
    expect(nodeOf($space)->parent_id)->toBe($active->id);
});

it('новое пространство встаёт в конец корня, с иконкой', function () {
    makeFolder('Папка');

    $this->postJson('/api/v1/admin/spaces', ['name' => 'Маркетинг', 'key' => 'MKT', 'icon' => 'x'])
        ->assertUnprocessable()->assertJsonValidationErrors('icon');
    $this->postJson('/api/v1/admin/spaces', ['name' => 'Маркетинг', 'key' => 'MKT', 'icon' => '📣'])
        ->assertCreated()->assertJsonPath('data.icon', '📣');

    $last = adminTree($this)->values()->last();
    expect($last)->toMatchArray(['type' => 'space', 'parent_id' => null, 'icon' => '📣'])
        ->and($last['space']['key'])->toBe('MKT');
});

it('новое пространство создаётся сразу в папке — в конец; родитель — только активная папка', function () {
    $folder = makeFolder('Mobile');
    $first = space(['key' => 'IOS']);
    placeIn(nodeOf($first), $folder);
    $archived = makeFolder('Старое');
    $archived->forceFill(['archived_at' => now()])->save();

    $this->postJson('/api/v1/admin/spaces', ['name' => 'Android', 'key' => 'AND', 'parent_id' => $folder->id])
        ->assertCreated();

    $tree = adminTree($this)->values();
    $android = $tree->firstWhere('space.key', 'AND');
    expect($android)->toMatchArray(['parent_id' => $folder->id, 'depth' => 2])
        ->and($tree->where('parent_id', $folder->id)->pluck('space.key')->values()->all())->toBe(['IOS', 'AND']);

    foreach ([$archived->id, nodeOf($first)->id, (string) str()->ulid()] as $parentId) {
        $this->postJson('/api/v1/admin/spaces', ['name' => 'Ещё', 'key' => 'MORE', 'parent_id' => $parentId])
            ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
    }
    $this->postJson('/api/v1/admin/spaces', ['name' => 'Ещё', 'key' => 'MORE', 'parent_id' => 'не-ulid'])
        ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
    expect(Space::query()->where('key', 'MORE')->exists())->toBeFalse();
});

it('в журнале дерева нет названий папок и ПДн', function () {
    $folder = makeFolder('Тайный проект «Альфа»');
    $this->patchJson("/api/v1/admin/nav-nodes/{$folder->id}", ['name' => 'Тайный проект «Бета»', 'icon' => '🔒'])->assertOk();
    $this->postJson("/api/v1/admin/nav-nodes/{$folder->id}/move", ['parent_id' => null])->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/archive")->assertOk();
    $this->postJson("/api/v1/admin/folders/{$folder->id}/restore")->assertOk();

    expectNoPersonalDataInEventLog();
    $journal = DB::table('event_log')->pluck('payload')->implode("\n");
    expect($journal)->not->toContain('Тайный')->not->toContain('🔒')
        ->and(loggedEventTypes())->toBe([
            'folder.created', 'folder.renamed', 'nav_node.icon_changed', 'nav_node.moved', 'folder.archived', 'folder.restored',
        ]);
});
