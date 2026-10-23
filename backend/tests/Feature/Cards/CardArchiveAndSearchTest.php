<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\CardTransition;

/*
| Архив карточек доски и поиск карточек пространства (этап 2c): по номеру или названию, только видимые
| пользователю карточки (ADR-0008).
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->editor = member();
    $this->commenter = member();
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->commenter, SpaceRole::Commenter);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);

    foreach (['Логин через SSO', 'Отчёт 100%', 'Почта', 'Логи nginx'] as $title) {
        makeCard($this->board, 'To Do', $this->editor, $title);                     // DEV-1…DEV-4
    }
    $this->archive = fn (string $key) => $this->actingAs($this->editor)->postJson("/api/v1/cards/{$key}/archive")->assertOk();
    $this->archived = fn (string $query = '', $user = null) => $this->actingAs($user ?? $this->editor)
        ->getJson("/api/v1/boards/{$this->board->id}/archived-cards?search=".urlencode($query));
});

it('колонке сменили тип, пока карточка в архиве: при восстановлении — переход «тип колонки изменён» (LATER-45)', function () {
    $admin = member();
    addToSpace($this->space, $admin, SpaceRole::Admin);
    $card = moveCard(Card::query()->where('number', 1)->sole(), 'In Progress', $this->editor);
    ($this->archive)('DEV-1');
    $this->actingAs($admin)->putJson('/api/v1/columns/'.columnNamed($this->board, 'In Progress')->id.'/category', ['category' => 'done'])->assertOk();

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/restore')->assertOk();

    expect($card->fresh()->completed_at)->not->toBeNull()
        ->and(CardTransition::query()->where('card_id', $card->id)->orderByDesc('id')->first())
        ->reason->value->toBe('column_type_changed');
});

describe('архив доски', function () {
    beforeEach(function () {
        ($this->archive)('DEV-1');
        ($this->travel(1)->minutes());
        ($this->archive)('DEV-2');
    });

    it('показывает архивные карточки доски, недавно архивированные сверху', function () {
        ($this->archived)()->assertOk()
            ->assertJsonPath('data.*.key', ['DEV-2', 'DEV-1'])
            ->assertJsonPath('data.0.column', ['name' => 'To Do', 'category' => 'queue'])
            ->assertJsonPath('data.0.archived_at', fn ($value) => str_ends_with($value, 'Z'))
            ->assertJsonPath('meta.total', 2);
    });

    it('ищет по номеру и по части названия', function (string $query, array $keys) {
        ($this->archived)($query)->assertOk()->assertJsonPath('data.*.key', $keys);
    })->with([
        // Число — это и номер, и часть названия («Отчёт 100%»)
        'номер' => ['1', ['DEV-2', 'DEV-1']],
        'номер с ключом' => ['dev-2', ['DEV-2']],
        'чужой ключ' => ['OPS-1', []],
        'часть названия без регистра' => ['логин', ['DEV-1']],
        '% — обычный символ' => ['100%', ['DEV-2']],
        '_ — обычный символ' => ['_', []],
    ]);

    it('восстановление возвращает карточку на доску и убирает из архива', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/restore')->assertOk();

        ($this->archived)()->assertJsonPath('data.*.key', ['DEV-2']);
    });

    it('commenter архив не видит (403), пользователь с ограничением — только свои', function () {
        ($this->archived)(user: $this->commenter)->assertForbidden();

        $restricted = member();
        addToSpace($this->space, $restricted, SpaceRole::Editor);
        restrictToOwnCards($restricted);
        Card::query()->where('number', 2)->update(['responsible_id' => $restricted->id]);

        ($this->archived)(user: $restricted)->assertOk()->assertJsonPath('data.*.key', ['DEV-2'])->assertJsonPath('meta.total', 1);
    });
});

describe('поиск карточек пространства', function () {
    beforeEach(function () {
        $this->search = fn (string $query = '', $user = null) => $this->actingAs($user ?? $this->commenter)
            ->getJson('/api/v1/spaces/DEV/cards?search='.urlencode($query));
    });

    it('ищет активные карточки на активных досках, новые сверху', function () {
        ($this->archive)('DEV-3');
        $archivedBoard = makeBoard($this->space, $this->editor, BoardTemplate::Simple, 'Старая');
        makeCard($archivedBoard, 'To Do', $this->editor, 'Логин старый');           // DEV-5
        $archivedBoard->forceFill(['archived_at' => now()])->save();
        $other = space(['key' => 'OPS']);
        addToSpace($other, $this->editor, SpaceRole::Editor);
        makeCard(makeBoard($other, $this->editor, BoardTemplate::Simple), 'To Do', $this->editor, 'Логин в OPS');

        ($this->search)()->assertOk()->assertJsonPath('data.*.key', ['DEV-4', 'DEV-2', 'DEV-1'])
            ->assertJsonPath('data.0.board.name', 'Доска');
        ($this->search)('лог')->assertJsonPath('data.*.key', ['DEV-4', 'DEV-1']);
        ($this->search)('DEV-4')->assertJsonPath('data.*.key', ['DEV-4']);
        ($this->search)('3')->assertJsonPath('data', []);
    });

    it('не больше 20 результатов', function () {
        foreach (range(1, 22) as $i) {
            makeCard($this->board, 'To Do', $this->editor, "Ещё {$i}");
        }

        ($this->search)()->assertJsonCount(20, 'data')->assertJsonPath('data.0.key', 'DEV-26');
    });

    it('пользователь с ограничением находит только свои карточки', function () {
        $restricted = member();
        addToSpace($this->space, $restricted, SpaceRole::Commenter);
        restrictToOwnCards($restricted);
        Card::query()->where('number', 4)->update(['customer_id' => $restricted->id]);

        ($this->search)(user: $restricted)->assertJsonPath('data.*.key', ['DEV-4']);
        ($this->search)('DEV-1', $restricted)->assertJsonPath('data', []);
    });

    it('проверяет длину запроса', function () {
        ($this->search)(str_repeat('я', 201))->assertJsonValidationErrors('search');
    });
});
