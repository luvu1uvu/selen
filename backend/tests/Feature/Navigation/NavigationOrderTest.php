<?php

use App\Enums\SpaceRole;
use App\Models\Group;

/*
| Порядок дерева пользователя (GET /navigation) совпадает с порядком «Структуры» (GET /admin/navigation)
| после любого перемещения: выше/ниже, в папку, в корень, из папки в папку (ADR-0013).
*/

beforeEach(function () {
    $this->admin = admin();
    $this->user = member();

    $this->folderA = makeFolder('Папка A');
    $this->folderB = makeFolder('Папка B');
    foreach (['ONE', 'TWO', 'THREE', 'FOUR'] as $key) {
        $space = space(['key' => $key, 'name' => $key]);
        grantGroup($space, Group::everyone(company()), SpaceRole::Commenter);
        $this->{$key} = nodeOf($space);
    }
    placeIn($this->THREE, $this->folderA);
    placeIn($this->FOUR, $this->folderA);
});

/** «Структура» глазами пользователя: активные узлы с отступом по глубине, папки без видимого содержимого — нет. */
function structureOrder(array $nodes): array
{
    $rows = array_values(array_filter($nodes, fn ($node) => $node['archived_at'] === null && ($node['space']['archived_at'] ?? null) === null));
    $hasContent = function (string $id) use (&$hasContent, $rows): bool {
        foreach ($rows as $row) {
            if ($row['parent_id'] === $id && ($row['type'] === 'space' || $hasContent($row['id']))) {
                return true;
            }
        }

        return false;
    };

    return array_values(array_map(
        fn ($node) => str_repeat('  ', $node['depth'] - 1).($node['type'] === 'folder' ? "[{$node['name']}]" : $node['space']['key']),
        array_filter($rows, fn ($node) => $node['type'] === 'space' || $hasContent($node['id'])),
    ));
}

function expectSameOrder(): array
{
    $admin = test()->actingAs(test()->admin)->getJson(adminPath().'navigation')->assertOk()->json('data');
    $user = navItems(test()->actingAs(test()->user)->getJson('/api/v1/navigation'));

    expect(flatTree($user))->toBe(structureOrder($admin));

    return flatTree($user);
}

function moveNode(string $id, array $payload): void
{
    test()->actingAs(test()->admin)->postJson(adminPath()."nav-nodes/{$id}/move", $payload)->assertOk();
}

it('сохраняет порядок «Структуры» после каждого вида перемещения', function () {
    // Пустая «Папка B» пользователю не видна
    expect(expectSameOrder())->toBe(['[Папка A]', '  THREE', '  FOUR', 'ONE', 'TWO']);

    // Ниже и выше в корне — соседи, как присылает «Структура»
    moveNode($this->ONE->id, ['parent_id' => null, 'after_id' => $this->TWO->id]);
    expect(expectSameOrder())->toBe(['[Папка A]', '  THREE', '  FOUR', 'TWO', 'ONE']);
    moveNode($this->ONE->id, ['parent_id' => null, 'before_id' => $this->folderA->id]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  THREE', '  FOUR', 'TWO']);

    // В папку (в конец), выше внутри папки
    moveNode($this->TWO->id, ['parent_id' => $this->folderA->id]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  THREE', '  FOUR', '  TWO']);
    moveNode($this->TWO->id, ['parent_id' => $this->folderA->id, 'before_id' => $this->THREE->id]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  TWO', '  THREE', '  FOUR']);

    // Из папки в папку и в корень (в конец)
    moveNode($this->FOUR->id, ['parent_id' => $this->folderB->id]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  TWO', '  THREE', '[Папка B]', '  FOUR']);
    moveNode($this->THREE->id, ['parent_id' => null]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  TWO', '[Папка B]', '  FOUR', 'THREE']);

    // Папка целиком — выше в корне и внутрь другой папки
    moveNode($this->folderB->id, ['parent_id' => null, 'before_id' => $this->ONE->id]);
    expect(expectSameOrder())->toBe(['[Папка B]', '  FOUR', 'ONE', '[Папка A]', '  TWO', 'THREE']);
    moveNode($this->folderB->id, ['parent_id' => $this->folderA->id]);
    expect(expectSameOrder())->toBe(['ONE', '[Папка A]', '  TWO', '  [Папка B]', '    FOUR', 'THREE']);
});
