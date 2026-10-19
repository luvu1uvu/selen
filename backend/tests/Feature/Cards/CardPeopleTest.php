<?php

use App\Actions\Cards\MoveCardAction;
use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\EventLogEntry;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/*
| Люди в карточке: заказчик (по умолчанию автор), ответственный, участники; автоназначение при переходе
| в работу (настройка доски).
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->admin = member();
    $this->editor = member();
    $this->commenter = member();
    addToSpace($this->space, $this->admin, SpaceRole::Admin);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->commenter, SpaceRole::Commenter);
    $this->board = makeBoard($this->space, $this->admin, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
});

/** @return list<string> */
function participantIds(Card $card): array
{
    return DB::table('card_participants')->where('card_id', $card->id)->orderBy('user_id')->pluck('user_id')->all();
}

it('заказчик новой карточки — её автор, ответственного нет', function () {
    $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')
        ->assertOk()
        ->assertJsonPath('data.customer.id', $this->editor->id)
        ->assertJsonPath('data.customer.in_space', true)
        ->assertJsonPath('data.responsible', null)
        ->assertJsonPath('data.participants', []);
});

it('меняет заказчика и ответственного; в журнал — id было/стало', function () {
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', [
        'customer_id' => $this->admin->id,
        'responsible_id' => $this->commenter->id,
    ])->assertOk()
        ->assertJsonPath('data.customer.id', $this->admin->id)
        ->assertJsonPath('data.responsible.id', $this->commenter->id);

    expect(EventLogEntry::query()->where('event_type', 'card.updated')->sole()->payload)->toEqual([
        'fields' => ['customer_id', 'responsible_id'],
        'changes' => [
            'customer_id' => ['from' => $this->editor->id, 'to' => $this->admin->id],
            'responsible_id' => ['from' => null, 'to' => $this->commenter->id],
        ],
    ]);

    // Снять ответственного
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => null])
        ->assertOk()->assertJsonPath('data.responsible', null);
    // Заказчик обязателен
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['customer_id' => null])
        ->assertUnprocessable()->assertJsonValidationErrors('customer_id');
});

it('назначить можно участника пространства — активного или приглашённого, но не деактивированного и не чужого', function () {
    $invited = User::factory()->invited()->create();
    $deactivated = User::factory()->deactivated()->create();
    $outsider = member();
    addToSpace($this->space, $invited, SpaceRole::Commenter);
    addToSpace($this->space, $deactivated, SpaceRole::Editor);

    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $invited->id])
        ->assertOk()->assertJsonPath('data.responsible.status', 'invited');

    foreach ([$deactivated, $outsider] as $user) {
        $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $user->id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.responsible_id.0', __('selen.cards.not_assignable'));
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $user->id])
            ->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }
});

it('деактивированный и исключённый из пространства остаются на карточке с пометками', function () {
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $this->commenter->id])->assertOk();
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->admin->id])->assertOk();

    $this->commenter->forceFill(['status' => 'deactivated'])->save();
    $newAdmin = member();
    addToSpace($this->space, $newAdmin, SpaceRole::Admin);
    $this->actingAs($newAdmin)->deleteJson("/api/v1/spaces/DEV/members/{$this->admin->id}")->assertNoContent();

    $response = $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')->assertOk();
    $response->assertJsonPath('data.responsible.status', 'deactivated')
        ->assertJsonPath('data.participants.0.id', $this->admin->id)
        ->assertJsonPath('data.participants.0.in_space', false);

    // Повторная отправка того же (уже деактивированного) ответственного — не назначение
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $this->commenter->id, 'title' => 'Новое'])
        ->assertOk();
});

it('добавляет и убирает участников; в журнал — id', function () {
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->commenter->id])
        ->assertOk()
        ->assertJsonPath('data.participants.0.id', $this->commenter->id);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->commenter->id])
        ->assertUnprocessable()->assertJsonPath('errors.user_id.0', __('selen.cards.already_participant'));

    $this->actingAs($this->editor)->deleteJson("/api/v1/cards/DEV-1/participants/{$this->commenter->id}")
        ->assertOk()->assertJsonPath('data.participants', []);
    $this->actingAs($this->editor)->deleteJson("/api/v1/cards/DEV-1/participants/{$this->commenter->id}")
        ->assertUnprocessable()->assertJsonPath('errors.user_id.0', __('selen.cards.not_participant'));

    expect(EventLogEntry::query()->whereIn('event_type', ['card.participant_added', 'card.participant_removed'])->orderBy('id')->get()
        ->map(fn ($e) => [$e->event_type, $e->payload])->all())
        ->toEqual([
            ['card.participant_added', ['user_id' => $this->commenter->id]],
            ['card.participant_removed', ['user_id' => $this->commenter->id]],
        ]);
});

it('commenter не меняет людей карточки', function () {
    $this->actingAs($this->commenter)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $this->commenter->id])->assertForbidden();
    $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->commenter->id])->assertForbidden();
});

it('в архивной карточке людей не меняют', function () {
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();

    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->commenter->id])
        ->assertUnprocessable()->assertJsonPath('errors.card.0', __('selen.cards.archived'));
});

describe('автоназначение при переходе в работу', function () {
    it('без ответственного — переместивший становится ответственным', function () {
        moveCard($this->card, 'In Progress', $this->admin);

        $card = $this->card->fresh();
        expect($card->responsible_id)->toBe($this->admin->id)
            ->and(participantIds($card))->toBe([]);
        expect(EventLogEntry::query()->where('event_type', 'card.updated')->sole()->payload)->toEqual([
            'fields' => ['responsible_id'],
            'changes' => ['responsible_id' => ['from' => null, 'to' => $this->admin->id]],
            'via' => 'auto_assign',
        ]);
    });

    it('с ответственным — переместивший становится участником, ответственный прежний', function () {
        $this->card->forceFill(['responsible_id' => $this->commenter->id])->save();

        moveCard($this->card, 'In Progress', $this->editor);
        moveCard($this->card, 'Review', $this->editor);

        $card = $this->card->fresh();
        expect($card->responsible_id)->toBe($this->commenter->id)
            ->and(participantIds($card))->toBe([$this->editor->id]);
        expect(EventLogEntry::query()->where('event_type', 'card.participant_added')->sole()->payload)
            ->toEqual(['user_id' => $this->editor->id, 'via' => 'auto_assign']);
    });

    it('ответственный, который двигает свою карточку, ничего не меняет', function () {
        $this->card->forceFill(['responsible_id' => $this->editor->id])->save();

        moveCard($this->card, 'Done', $this->editor);

        expect(participantIds($this->card))->toBe([])
            ->and(EventLogEntry::query()->whereIn('event_type', ['card.updated', 'card.participant_added'])->count())->toBe(0);
    });

    it('в очередь и при перестановке в ячейке не срабатывает', function () {
        moveCard($this->card, 'In Progress', $this->admin);
        $this->card->forceFill(['responsible_id' => null])->save();

        moveCard($this->card, 'To Do', $this->editor);
        $card = $this->card->fresh();
        app(MoveCardAction::class)->handle($this->editor, $card, $card->column, $card->lane, null, null);

        expect($this->card->fresh()->responsible_id)->toBeNull()
            ->and(participantIds($this->card))->toBe([]);
    });

    it('админ пространства отключает автоназначение в настройках доски', function () {
        $this->actingAs($this->editor)->patchJson("/api/v1/boards/{$this->board->id}", ['auto_assign_on_move' => false])->assertForbidden();
        $this->actingAs($this->admin)->patchJson("/api/v1/boards/{$this->board->id}", ['auto_assign_on_move' => false])->assertOk();
        $this->actingAs($this->admin)->getJson("/api/v1/boards/{$this->board->id}")->assertJsonPath('data.auto_assign_on_move', false);

        moveCard($this->card, 'In Progress', $this->editor);

        expect($this->card->fresh()->responsible_id)->toBeNull()
            ->and(participantIds($this->card))->toBe([]);
    });
});

it('в журнале событий о людях нет ПДн', function () {
    $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['responsible_id' => $this->commenter->id])->assertOk();
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/participants', ['user_id' => $this->admin->id])->assertOk();
    moveCard($this->card, 'In Progress', $this->editor);

    expectNoPersonalDataInEventLog();
    expect(User::query()->count())->toBeGreaterThan(2);
});
