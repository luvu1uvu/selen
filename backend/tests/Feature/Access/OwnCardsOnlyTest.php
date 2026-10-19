<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\EventLogEntry;
use App\Models\Label;
use App\Models\SpaceMember;
use Illuminate\Support\Facades\DB;

/*
| Режим «только свои карточки» (docs/adr/0008-own-cards-only.md): ограничение доступа, а не фильтр.
| Пользователь видит только карточки, где он заказчик, ответственный или участник; остальные — 404.
| Матрица всех маршрутов карточки — в AccessMatrixTest.
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->admin = member();
    $this->editor = member();
    $this->restricted = member();
    addToSpace($this->space, $this->admin, SpaceRole::Admin);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->restricted, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->admin, BoardTemplate::Simple);

    $this->restrict = fn ($user = null, bool $on = true) => $this->actingAs($this->admin)
        ->patchJson('/api/v1/spaces/DEV/members/'.($user ?? $this->restricted)->id, ['own_cards_only' => $on]);
});

function restrictionOf($space, $user): bool
{
    return SpaceMember::query()->where('space_id', $space->id)->where('user_id', $user->id)->value('own_cards_only');
}

describe('флаг на участнике', function () {
    it('включает и выключает администратор пространства; в журнал — было/стало', function () {
        ($this->restrict)()->assertOk()->assertJsonPath('data.personal.own_cards_only', true)->assertJsonPath('data.role', 'editor');
        ($this->restrict)(on: false)->assertOk()->assertJsonPath('data.personal.own_cards_only', false);

        expect(EventLogEntry::query()->where('event_type', 'space.member_restriction_changed')->orderBy('id')->pluck('payload')->all())
            ->toEqual([
                ['user_id' => $this->restricted->id, 'from' => false, 'to' => true],
                ['user_id' => $this->restricted->id, 'from' => true, 'to' => false],
            ]);
        $this->actingAs($this->admin)->getJson('/api/v1/spaces/DEV/members')->assertJsonPath('data.0.personal.own_cards_only', false);
    });

    it('editor флаг не меняет; к администратору пространства флаг неприменим', function () {
        $this->actingAs($this->editor)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['own_cards_only' => true])
            ->assertForbidden();

        ($this->restrict)($this->admin)->assertUnprocessable()
            ->assertJsonPath('errors.own_cards_only.0', __('selen.spaces.admin_not_restricted'));
    });

    it('назначение администратором снимает ограничение', function () {
        ($this->restrict)()->assertOk();

        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['role' => 'admin'])
            ->assertOk()->assertJsonPath('data.personal.own_cards_only', false);

        expect(restrictionOf($this->space, $this->restricted))->toBeFalse()
            ->and(EventLogEntry::query()->where('event_type', 'space.member_restriction_changed')->orderByDesc('id')->first()->payload)
            ->toEqual(['user_id' => $this->restricted->id, 'from' => true, 'to' => false, 'via' => 'role_changed']);
    });

    it('роль и флаг можно поменять одним запросом; роль admin вместе с флагом — 422 без изменений', function () {
        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['role' => 'commenter', 'own_cards_only' => true])
            ->assertOk()->assertJsonPath('data.role', 'commenter')->assertJsonPath('data.personal.own_cards_only', true);

        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->editor->id}", ['role' => 'admin', 'own_cards_only' => true])
            ->assertUnprocessable();
        expect(SpaceMember::query()->where('user_id', $this->editor->id)->value('role'))->toBe(SpaceRole::Editor);
    });
});

describe('видимость карточек', function () {
    beforeEach(function () {
        ($this->restrict)()->assertOk();
        $this->asCustomer = makeCard($this->board, 'To Do', $this->editor, 'Заказчик');
        $this->asResponsible = makeCard($this->board, 'To Do', $this->editor, 'Ответственный');
        $this->asParticipant = makeCard($this->board, 'In Progress', $this->editor, 'Участник');
        $this->foreign = makeCard($this->board, 'In Progress', $this->editor, 'Чужая');
        $this->asCustomer->forceFill(['customer_id' => $this->restricted->id])->save();
        $this->asResponsible->forceFill(['responsible_id' => $this->restricted->id])->save();
        DB::table('card_participants')->insert(['card_id' => $this->asParticipant->id, 'user_id' => $this->restricted->id, 'created_at' => now()]);
    });

    it('на доске только свои карточки — значит, и счётчики колонок только по ним', function () {
        $titles = fn ($user) => collect($this->actingAs($user)->getJson("/api/v1/boards/{$this->board->id}")->assertOk()->json('data.cards'))
            ->pluck('title')->sort()->values()->all();

        expect($titles($this->restricted))->toBe(['Заказчик', 'Ответственный', 'Участник'])
            ->and($titles($this->editor))->toBe(['Заказчик', 'Ответственный', 'Участник', 'Чужая']);
    });

    it('чужая карточка не существует: по прямой ссылке и в истории — 404, как несуществующая', function () {
        $key = 'DEV-'.$this->foreign->number;

        $foreign = $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$key}")->assertNotFound();
        $missing = $this->actingAs($this->restricted)->getJson('/api/v1/cards/DEV-999')->assertNotFound();
        expect($foreign->json())->toBe($missing->json());
        $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$key}/transitions")->assertNotFound();

        $this->actingAs($this->restricted)->getJson('/api/v1/cards/DEV-'.$this->asParticipant->number)->assertOk()
            ->assertJsonPath('data.permissions.restricted', true);
    });

    it('новая карточка пользователя с ограничением видна ему — он заказчик', function () {
        $this->actingAs($this->restricted)->postJson("/api/v1/boards/{$this->board->id}/cards", [
            'title' => 'Моя', 'column_id' => columnNamed($this->board, 'To Do')->id, 'lane_id' => firstLane($this->board)->id,
        ])->assertCreated()->assertJsonPath('data.customer.id', $this->restricted->id);
    });

    it('после снятия ограничения видны все карточки', function () {
        ($this->restrict)(on: false)->assertOk();

        $this->actingAs($this->restricted)->getJson('/api/v1/cards/DEV-'.$this->foreign->number)->assertOk();
    });

    it('убранный из участников другим пользователем теряет доступ', function () {
        $key = 'DEV-'.$this->asParticipant->number;

        $this->actingAs($this->editor)->deleteJson("/api/v1/cards/{$key}/participants/{$this->restricted->id}")->assertOk();

        $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$key}")->assertNotFound();
    });
});

describe('не потерять доступ своим действием (поправка PM B)', function () {
    beforeEach(function () {
        ($this->restrict)()->assertOk();
        $this->card = makeCard($this->board, 'To Do', $this->restricted);
        $this->key = 'DEV-'.$this->card->number;
    });

    it('сменил заказчика на другого — остаётся участником', function () {
        $this->actingAs($this->restricted)->patchJson("/api/v1/cards/{$this->key}", ['customer_id' => $this->editor->id])
            ->assertOk()
            ->assertJsonPath('data.customer.id', $this->editor->id)
            ->assertJsonPath('data.participants.0.id', $this->restricted->id);

        $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$this->key}")->assertOk();
        expect(EventLogEntry::query()->where('event_type', 'card.participant_added')->sole()->payload)
            ->toEqual(['user_id' => $this->restricted->id, 'via' => 'keep_access']);
    });

    it('передал ответственность другому, не будучи заказчиком, — остаётся участником', function () {
        $this->card->forceFill(['customer_id' => $this->editor->id, 'responsible_id' => $this->restricted->id])->save();

        $this->actingAs($this->restricted)->patchJson("/api/v1/cards/{$this->key}", ['responsible_id' => $this->editor->id])
            ->assertOk()->assertJsonPath('data.participants.0.id', $this->restricted->id);
    });

    it('не убирает себя из участников, если перестанет видеть карточку; другой пользователь — может', function () {
        $this->card->forceFill(['customer_id' => $this->editor->id])->save();
        DB::table('card_participants')->insert(['card_id' => $this->card->id, 'user_id' => $this->restricted->id, 'created_at' => now()]);

        $this->actingAs($this->restricted)->deleteJson("/api/v1/cards/{$this->key}/participants/{$this->restricted->id}")
            ->assertUnprocessable()->assertJsonPath('errors.user_id.0', __('selen.cards.keep_access'));

        $this->actingAs($this->editor)->deleteJson("/api/v1/cards/{$this->key}/participants/{$this->restricted->id}")->assertOk();
        $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$this->key}")->assertNotFound();
    });

    it('убрать себя из участников можно, если остаётся заказчиком', function () {
        DB::table('card_participants')->insert(['card_id' => $this->card->id, 'user_id' => $this->restricted->id, 'created_at' => now()]);

        $this->actingAs($this->restricted)->deleteJson("/api/v1/cards/{$this->key}/participants/{$this->restricted->id}")->assertOk();
    });

    it('без ограничения правило не действует', function () {
        $this->actingAs($this->editor)->patchJson("/api/v1/cards/{$this->key}", ['customer_id' => $this->admin->id])
            ->assertOk()->assertJsonPath('data.participants', []);
    });
});

it('доска читается фиксированным числом запросов, сколько бы ни было карточек', function () {
    // «Лотерея» очистки сессий иногда добавляет DELETE — в этом тесте она мешает считать
    config(['session.lottery' => [0, 100]]);
    $queries = function () {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")->assertOk();

        return count(DB::getQueryLog());
    };

    $label = Label::query()->forceCreate(['space_id' => null, 'name' => 'Метка', 'color' => '#ff0000']);
    $tag = function (Card $card) use ($label) {
        $card->labels()->attach($label->id);
        $card->forceFill(['responsible_id' => $this->admin->id])->save();
    };

    $tag(makeCard($this->board, 'To Do', $this->editor));
    $queries(); // первый запрос дополнительно создаёт сессию
    $few = $queries();
    foreach (range(1, 10) as $i) {
        $tag(makeCard($this->board, 'In Progress', $this->editor));
    }

    expect($queries())->toBe($few);
});
