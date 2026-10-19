<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\CardBlock;
use App\Models\EventLogEntry;
use App\Models\SpaceMember;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Блокировки (docs/adr/0011-card-blocks.md): эпизоды в card_blocks, несколько одновременно, причина — текст
| и/или блокирующая карточка, автоснятие при входе блокирующей в «готово», история не перезаписывается.
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->admin = member();
    $this->editor = member();
    addToSpace($this->space, $this->admin, SpaceRole::Admin);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->admin, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'In Progress', $this->editor, 'Задача');   // DEV-1
    $this->blocker = makeCard($this->board, 'To Do', $this->editor, 'Доступы');     // DEV-2
    $this->block = fn (array $data, string $card = 'DEV-1', $user = null) => $this->actingAs($user ?? $this->editor)
        ->postJson("/api/v1/cards/{$card}/blocks", $data);
});

it('блокирует по тексту причины; в журнал — без текста', function () {
    ($this->block)(['reason' => '  Ждём доступы от заказчика  '])
        ->assertCreated()
        ->assertJsonPath('data.blocks.0.reason', 'Ждём доступы от заказчика')
        ->assertJsonPath('data.blocks.0.blocking_card', null)
        ->assertJsonPath('data.blocks.0.started_by.id', $this->editor->id)
        ->assertJsonPath('data.blocks.0.ended_at', null);

    $block = CardBlock::query()->sole();
    expect(EventLogEntry::query()->where('event_type', 'card.blocked')->sole()->payload)
        ->toEqual(['block_id' => $block->id, 'blocking_card_id' => null, 'has_reason' => true])
        ->and(DB::table('event_log')->pluck('payload')->implode(' '))->not->toContain('доступы');
});

it('блокирует карточкой; несколько блокировок одновременно; фасад выделяет карточку', function () {
    ($this->block)(['blocking_card' => 'dev-2'])
        ->assertCreated()
        ->assertJsonPath('data.blocks.0.blocking_card.key', 'DEV-2')
        ->assertJsonPath('data.blocks.0.reason', null);
    ($this->block)(['reason' => 'И ещё ждём макет', 'blocking_card' => null])->assertCreated()->assertJsonCount(2, 'data.blocks');

    $cards = collect($this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")->json('data.cards'))->keyBy('key');
    expect($cards['DEV-1']['is_blocked'])->toBeTrue()->and($cards['DEV-2']['is_blocked'])->toBeFalse();
});

it('проверяет причину и блокирующую карточку', function (array $data, string $field, string $message) {
    $otherSpace = space(['key' => 'OPS']);
    addToSpace($otherSpace, $this->editor, SpaceRole::Editor);
    makeCard(makeBoard($otherSpace, $this->editor, BoardTemplate::Simple), 'To Do', $this->editor);
    makeCard($this->board, 'Done', $this->editor, 'Готовая');                      // DEV-3
    makeCard($this->board, 'To Do', $this->editor, 'В архиве');                     // DEV-4
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-4/archive')->assertOk();

    ($this->block)($data)->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);
    expect(CardBlock::query()->count())->toBe(0);
})->with([
    'пусто' => [[], 'reason', 'Укажите причину или блокирующую карточку.'],
    'пробелы' => [['reason' => '   '], 'reason', 'Укажите причину или блокирующую карточку.'],
    'нет такой карточки' => [['blocking_card' => 'DEV-99'], 'blocking_card', 'Карточка не найдена.'],
    'другое пространство' => [['blocking_card' => 'OPS-1'], 'blocking_card', 'Карточка не найдена.'],
    'сама себя' => [['blocking_card' => 'DEV-1'], 'blocking_card', 'Карточка не может блокировать саму себя.'],
    'уже готова' => [['blocking_card' => 'DEV-3'], 'blocking_card', 'Блокирующая карточка уже готова.'],
    'в архиве' => [['blocking_card' => 'DEV-4'], 'blocking_card', 'Блокирующая карточка в архиве.'],
    'длинная причина' => [['reason' => str_repeat('я', 1001)], 'reason', 'Количество символов в значении поля причина не может превышать 1000.'],
]);

it('одна активная блокировка на пару карточек; после снятия — снова можно', function () {
    ($this->block)(['blocking_card' => 'DEV-2'])->assertCreated();
    ($this->block)(['blocking_card' => 'DEV-2'])->assertJsonValidationErrors(['blocking_card' => 'Эта карточка уже блокирует текущую.']);

    $this->actingAs($this->editor)->postJson('/api/v1/card-blocks/'.CardBlock::query()->sole()->id.'/resolve')->assertOk();
    ($this->block)(['blocking_card' => 'DEV-2'])->assertCreated();
});

it('снимает вручную: эпизод закрыт, строка в истории; повторно — 422', function () {
    $block = makeBlock($this->card, $this->editor);

    $this->actingAs($this->admin)->postJson("/api/v1/card-blocks/{$block->id}/resolve")
        ->assertOk()
        ->assertJsonPath('data.blocks.0.end_reason', 'manual')
        ->assertJsonPath('data.blocks.0.ended_by.id', $this->admin->id)
        ->assertJsonPath('data.blocks.0.reason', 'Ждём доступы');

    $this->actingAs($this->admin)->postJson("/api/v1/card-blocks/{$block->id}/resolve")
        ->assertJsonValidationErrors(['block' => 'Блокировка уже снята.']);
    expect(EventLogEntry::query()->where('event_type', 'card.unblocked')->sole()->payload)
        ->toEqual(['block_id' => $block->id, 'blocking_card_id' => null, 'end_reason' => 'manual']);
});

it('блокирующая вошла в «готово» — её блокировки снимаются автоматически, остальные остаются', function () {
    $other = makeCard($this->board, 'To Do', $this->editor, 'Третья');               // DEV-3
    $byCard = makeBlock($this->card, $this->editor, $this->blocker, null);
    $byText = makeBlock($this->card, $this->editor);
    $otherCard = makeBlock($other, $this->editor, $this->blocker, 'Тоже ждёт');

    moveCard($this->blocker, 'In Progress', $this->admin);
    expect($byCard->fresh()->isActive())->toBeTrue();

    moveCard($this->blocker, 'Done', $this->admin);

    foreach ([$byCard, $otherCard] as $block) {
        $block->refresh();
        expect($block->isActive())->toBeFalse()
            ->and($block->end_reason->value)->toBe('blocker_completed')
            ->and($block->ended_by)->toBe($this->admin->id);
    }
    expect($byText->fresh()->isActive())->toBeTrue()
        ->and(EventLogEntry::query()->where('event_type', 'card.unblocked')->where('subject_id', $this->card->id)->sole()->payload)
        ->toEqual(['block_id' => $byCard->id, 'blocking_card_id' => $this->blocker->id, 'end_reason' => 'blocker_completed']);

    // История эпизода сохранена и видна в карточке
    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')
        ->assertJsonCount(2, 'data.blocks')
        ->assertJsonPath('data.blocks.1.end_reason', 'blocker_completed')
        ->assertJsonPath('data.blocks.1.blocking_card.key', 'DEV-2');
});

it('автоснятие и при смене типа колонки блокирующей на «готово»', function () {
    $block = makeBlock($this->card, $this->editor, $this->blocker, null);

    $this->actingAs($this->admin)->putJson('/api/v1/columns/'.columnNamed($this->board, 'To Do')->id.'/category', ['category' => 'done'])
        ->assertOk();

    expect($block->fresh()->end_reason?->value)->toBe('blocker_completed')
        ->and($block->fresh()->ended_by)->toBe($this->admin->id);
});

it('архивная карточка: блокировки не меняются', function () {
    $block = makeBlock($this->card, $this->editor);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();

    ($this->block)(['reason' => 'Ещё'])->assertJsonValidationErrors(['card' => 'Карточка в архиве.']);
    $this->actingAs($this->editor)->postJson("/api/v1/card-blocks/{$block->id}/resolve")
        ->assertJsonValidationErrors(['card' => 'Карточка в архиве.']);
});

it('пользователь с ограничением видит блокирующую карточку как скрытую и не может ею блокировать', function () {
    $restricted = member();
    addToSpace($this->space, $restricted, SpaceRole::Editor);
    SpaceMember::query()->where('user_id', $restricted->id)->update(['own_cards_only' => true]);
    $this->card->forceFill(['responsible_id' => $restricted->id])->save();
    makeBlock($this->card, $this->editor, $this->blocker, null);

    $response = $this->actingAs($restricted)->getJson('/api/v1/cards/DEV-1')
        ->assertOk()
        ->assertJsonPath('data.blocks.0.blocking_card', ['hidden' => true]);
    expect($response->content())->not->toContain('Доступы')->not->toContain($this->blocker->id);

    ($this->block)(['blocking_card' => 'DEV-2'], user: $restricted)
        ->assertJsonValidationErrors(['blocking_card' => 'Карточка не найдена.']);
    // Снять блокировку своей карточки может
    $this->actingAs($restricted)->postJson('/api/v1/card-blocks/'.CardBlock::query()->sole()->id.'/resolve')->assertOk();
});

describe('история блокировок не перезаписывается (триггер в БД)', function () {
    beforeEach(function () {
        $this->row = makeBlock($this->card, $this->editor);
        $this->fails = fn (string $sql, array $bindings = []) => expect(fn () => DB::transaction(fn () => DB::statement($sql, $bindings)))
            ->toThrow(QueryException::class);
    });

    it('нельзя менять причину и начало', function () {
        ($this->fails)('UPDATE card_blocks SET reason = ? WHERE id = ?', ['другое', $this->row->id]);
        ($this->fails)('UPDATE card_blocks SET started_at = now() - interval \'1 day\' WHERE id = ?', [$this->row->id]);
    });

    it('закрыть открытый эпизод можно, менять закрытый — нельзя', function () {
        DB::statement("UPDATE card_blocks SET ended_at = clock_timestamp(), end_reason = 'manual' WHERE id = ?", [$this->row->id]);
        ($this->fails)('UPDATE card_blocks SET ended_at = NULL, end_reason = NULL WHERE id = ?', [$this->row->id]);
        ($this->fails)("UPDATE card_blocks SET end_reason = 'blocker_completed' WHERE id = ?", [$this->row->id]);
    });

    it('нельзя удалить и очистить таблицу', function () {
        ($this->fails)('DELETE FROM card_blocks WHERE id = ?', [$this->row->id]);
        ($this->fails)('TRUNCATE card_blocks');
        expect(fn () => $this->row->delete())->toThrow(LogicException::class);
    });

    it('CHECK: причина обязательна, конец согласован', function () {
        ($this->fails)('INSERT INTO card_blocks (id, card_id, started_at, started_by) VALUES (?, ?, now(), ?)', [
            (string) str()->ulid(), $this->card->id, $this->editor->id,
        ]);
        ($this->fails)('UPDATE card_blocks SET ended_at = clock_timestamp() WHERE id = ?', [$this->row->id]);
    });
});

it('в журнале блокировок нет персональных данных', function () {
    ($this->block)(['reason' => "Ждём {$this->admin->name}", 'blocking_card' => 'DEV-2'])->assertCreated();
    moveCard($this->blocker, 'Done', $this->editor);

    expectNoPersonalDataInEventLog();
});
