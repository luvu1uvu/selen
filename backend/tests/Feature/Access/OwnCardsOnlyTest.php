<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\AccessGrant;
use App\Models\Card;
use App\Models\EventLogEntry;
use App\Models\Label;
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

    // «Только свои карточки» — роль «Редактор — только свои карточки» (П2d-1: роли списком, флага нет)
    $this->restrict = fn ($user = null, bool $on = true) => $this->actingAs($this->admin)
        ->patchJson('/api/v1/spaces/DEV/members/'.($user ?? $this->restricted)->id, ['roles' => [$on ? 'editor_own' : 'editor']]);
});

function restrictionOf($space, $user): bool
{
    return AccessGrant::query()->onSpace($space)->where('user_id', $user->id)->with('role')->get()
        ->every(fn (AccessGrant $grant) => $grant->standardRole()->ownCardsOnly());
}

describe('«только свои карточки» — роль участника', function () {
    it('меняет администратор пространства ролью; в журнал — роли было/стало', function () {
        ($this->restrict)()->assertOk()->assertJsonPath('data.personal.roles', ['editor_own']);
        expect(restrictionOf($this->space, $this->restricted))->toBeTrue();
        ($this->restrict)(on: false)->assertOk()->assertJsonPath('data.personal.roles', ['editor']);
        expect(restrictionOf($this->space, $this->restricted))->toBeFalse();

        expect(EventLogEntry::query()->where('event_type', 'space.member_role_changed')->orderBy('id')->pluck('payload')->all())
            ->toEqual([
                ['user_id' => $this->restricted->id, 'from' => ['editor'], 'to' => ['editor_own']],
                ['user_id' => $this->restricted->id, 'from' => ['editor_own'], 'to' => ['editor']],
            ]);
    });

    it('editor роли не меняет; варианта «Администратор — только свои» нет', function () {
        $this->actingAs($this->editor)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['roles' => ['editor_own']])
            ->assertForbidden();

        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['roles' => ['admin_own']])
            ->assertUnprocessable()->assertJsonValidationErrors('roles.0');
        expect(restrictionOf($this->space, $this->restricted))->toBeFalse();
    });

    it('роль «Администратор» снимает ограничение', function () {
        ($this->restrict)()->assertOk();

        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['roles' => ['admin']])
            ->assertOk()->assertJsonPath('data.personal.roles', ['admin']);

        expect(restrictionOf($this->space, $this->restricted))->toBeFalse();
    });

    it('несколько ролей: «Комментатор» и «Редактор — только свои» — видит все карточки, правит только свои', function () {
        $this->actingAs($this->admin)->patchJson("/api/v1/spaces/DEV/members/{$this->restricted->id}", ['roles' => ['commenter', 'editor_own']])
            ->assertOk()->assertJsonPath('data.personal.roles', ['commenter', 'editor_own']);
        $foreign = makeCard($this->board, 'To Do', $this->editor, 'Чужая');
        $own = makeCard($this->board, 'To Do', $this->editor, 'Своя');
        $own->forceFill(['responsible_id' => $this->restricted->id])->save();

        $this->actingAs($this->restricted)->getJson("/api/v1/cards/{$foreign->key()}")->assertOk();
        $this->actingAs($this->restricted)->patchJson("/api/v1/cards/{$foreign->key()}", ['title' => 'Чужая, правка'])->assertForbidden();
        $this->actingAs($this->restricted)->patchJson("/api/v1/cards/{$own->key()}", ['title' => 'Своя, правка'])->assertOk();
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

    $label = Label::query()->forceCreate(['company_id' => company()->id, 'space_id' => null, 'name' => 'Метка', 'color' => '#ff0000']);
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
