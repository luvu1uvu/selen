<?php

use App\Actions\Columns\CreateColumnAction;
use App\Actions\Labels\SaveLabelAction;
use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\Label;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Space;
use App\Support\FractionalIndex;

/*
| Удаление навсегда из дерева (LATER-43, ADR-0013 «Изменения»): только пустая папка и пространство, в котором
| никогда не было карточек (ни активных, ни архивных, ни в корзине — LATER-45). Удаляет только системный администратор.
*/

beforeEach(function () {
    $this->admin = admin();
    $this->actingAs($this->admin);
});

describe('папка', function () {
    it('пустая удаляется навсегда, в журнале — folder.deleted с родителем', function () {
        $parent = makeFolder('Продукт');
        $folder = makeFolder('Пустая', $parent);

        $tree = collect($this->deleteJson(adminPath()."folders/{$folder->id}")->assertOk()->json('data'))->keyBy('id');

        expect($tree->has($folder->id))->toBeFalse()
            ->and(NavNode::query()->whereKey($folder->id)->exists())->toBeFalse()
            ->and(EventLogEntry::query()->where('event_type', 'folder.deleted')->sole())
            ->subject_id->toBe($folder->id)
            ->payload->toEqual(['parent_id' => $parent->id]);
    });

    it('с вложенной папкой или пространством (в том числе архивными) — 422, ничего не удалено', function (Closure $fill) {
        $folder = makeFolder('Мобайл');
        $fill($folder);

        $this->deleteJson(adminPath()."folders/{$folder->id}")
            ->assertUnprocessable()
            ->assertJsonPath('errors.node.0', __('selen.navigation.delete_not_empty'));

        expect(NavNode::query()->whereKey($folder->id)->exists())->toBeTrue()
            ->and(EventLogEntry::query()->where('event_type', 'folder.deleted')->exists())->toBeFalse();
    })->with([
        'папка' => [fn (NavNode $folder) => makeFolder('iOS', $folder)],
        'архивная папка' => [fn (NavNode $folder) => makeFolder('Старое', $folder)->forceFill(['archived_at' => now()])->save()],
        'пространство' => [fn (NavNode $folder) => placeIn(nodeOf(space()), $folder)],
        'архивное пространство' => [fn (NavNode $folder) => placeIn(nodeOf(space(['archived_at' => now()])), $folder)],
    ]);

    it('узел пространства через маршрут папки — 404', function () {
        $this->deleteJson(adminPath().'folders/'.nodeOf(space())->id)->assertNotFound();
    });
});

describe('пространство', function () {
    it('пустое удаляется вместе со структурой: доски (и архивные), колонки, дорожки, участники, группы, метки, узел дерева', function () {
        $space = space(['key' => 'TMP']);
        $member = member();
        addToSpace($space, $member, SpaceRole::Editor);
        grantGroup($space, makeGroup(), SpaceRole::Commenter);
        grantGroup($space, Group::everyone(company()), SpaceRole::Commenter);
        $board = makeBoard($space, $this->admin, BoardTemplate::Development);
        $archived = makeBoard($space, $this->admin, BoardTemplate::Simple, 'Старая');
        $archived->forceFill(['archived_at' => now()])->save();
        // Подколонка: удаляется раньше своей колонки (внешний ключ RESTRICT)
        $parent = columnNamed($board, 'In Progress');
        app(CreateColumnAction::class)->handle($this->admin, $board, 'Dev', null, $parent, null, null);
        app(SaveLabelAction::class)->handle($this->admin, ['name' => 'Срочно', 'color' => '#ef4444'], space: $space);
        $other = space(['key' => 'KEEP']);
        $keepBoard = makeBoard($other, $this->admin);
        $nodeId = nodeOf($space)->id;
        expect(AccessGrant::query()->where('nav_node_id', $nodeId)->count())->toBeGreaterThan(1);

        $this->deleteJson(adminPath()."spaces/{$space->id}")->assertNoContent();

        expect(Space::query()->whereKey($space->id)->exists())->toBeFalse()
            ->and(Board::query()->where('space_id', $space->id)->exists())->toBeFalse()
            ->and(BoardColumn::query()->whereIn('board_id', [$board->id, $archived->id])->exists())->toBeFalse()
            ->and(Lane::query()->whereIn('board_id', [$board->id, $archived->id])->exists())->toBeFalse()
            ->and(AccessGrant::query()->where('nav_node_id', $nodeId)->exists())->toBeFalse()
            ->and(Label::query()->where('space_id', $space->id)->exists())->toBeFalse()
            ->and(NavNode::query()->where('space_id', $space->id)->exists())->toBeFalse()
            // Соседнее пространство не тронуто
            ->and(Board::query()->whereKey($keepBoard->id)->exists())->toBeTrue();

        expect(EventLogEntry::query()->where('event_type', 'space.deleted')->sole())
            ->subject_id->toBe($space->id)
            ->payload->toEqual(['board_ids' => [$board->id, $archived->id]]);
        expectNoPersonalDataInEventLog();

        // Бывший участник пространства больше его не видит
        $this->actingAs($member)->getJson("/api/v1/spaces/{$space->key}")->assertNotFound();
    });

    it('доски в событии — по возрастанию id, как бы PostgreSQL ни отдал строки (LATER-101)', function () {
        $space = space(['key' => 'TMP']);
        $first = makeBoard($space, $this->admin);
        $second = makeBoard($space, $this->admin);
        // Доски — каждая в своём ряду, с одинаковой позицией; ничья в индексе (space_id, position) решается тем, где
        // лежит строка, — отсюда «то так, то наоборот». Первая доска с позицией позже второй без ORDER BY пришла бы второй
        $first->forceFill(['position' => FractionalIndex::between($second->position, null)])->save();

        $this->deleteJson(adminPath()."spaces/{$space->id}")->assertNoContent();

        expect(EventLogEntry::query()->where('event_type', 'space.deleted')->sole()->payload)
            ->toEqual(['board_ids' => [$first->id, $second->id]]);
    });

    it('с карточками (в том числе архивными) — 422 с числом карточек, ничего не удалено', function () {
        $space = space(['key' => 'DEV']);
        $board = makeBoard($space, $this->admin);
        makeCard($board, 'To Do', $this->admin);
        makeCard($board, 'To Do', $this->admin)->forceFill(['archived_at' => now()])->save();

        $this->deleteJson(adminPath()."spaces/{$space->id}")
            ->assertUnprocessable()
            ->assertJsonPath('errors.space.0', __('selen.spaces.delete_has_cards', ['count' => 2]));

        expect(Space::query()->whereKey($space->id)->exists())->toBeTrue()
            ->and(Board::query()->whereKey($board->id)->exists())->toBeTrue()
            ->and(Card::query()->count())->toBe(2)
            ->and(EventLogEntry::query()->where('event_type', 'space.deleted')->exists())->toBeFalse();
    });

    it('карточка в корзине тоже мешает: в пространстве были карточки — только архив (LATER-45)', function () {
        $space = space(['key' => 'OLD']);
        $board = makeBoard($space, $this->admin);
        $card = makeCard($board, 'To Do', $this->admin);
        $card->forceFill(['deleted_at' => now(), 'deleted_by' => $this->admin->id])->save();
        expect(Card::query()->where('space_id', $space->id)->exists())->toBeFalse();

        $this->deleteJson(adminPath()."spaces/{$space->id}")
            ->assertUnprocessable()
            ->assertJsonPath('errors.space.0', __('selen.spaces.delete_has_cards', ['count' => 1]));

        expect(Space::query()->whereKey($space->id)->exists())->toBeTrue()
            ->and(Card::withTrashed()->whereKey($card->id)->exists())->toBeTrue();
    });

    it('удаляет только администратор компании — администратору пространства 403', function () {
        $space = space();
        $user = member();
        addToSpace($space, $user, SpaceRole::Admin);

        $this->actingAs($user)->deleteJson(adminPath()."spaces/{$space->id}")->assertForbidden();
        expect(Space::query()->whereKey($space->id)->exists())->toBeTrue();
    });
});
