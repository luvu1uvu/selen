<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\EventLogEntry;
use App\Models\SpaceGroup;
use Illuminate\Support\Facades\DB;

/*
| Группы в пространстве (ADR-0012): вкладки «Люди» и «Группы», итоговые права по источникам,
| инвариант личного администратора, скрытие источников от пользователя только с «только своими карточками».
*/

beforeEach(function () {
    $this->space = space(['key' => 'FRONT', 'name' => 'Frontend']);
    $this->owner = member(['name' => 'Анна']);
    addToSpace($this->space, $this->owner, SpaceRole::Admin);
    $this->board = makeBoard($this->space, $this->owner, BoardTemplate::Simple);
});

describe('вкладка «Группы»', function () {
    it('админ пространства выдаёт, меняет и отзывает доступ группы', function () {
        $group = addToGroup(makeGroup(['name' => 'Contractors']), member(), member());
        $this->actingAs($this->owner);

        $this->postJson('/api/v1/spaces/FRONT/groups', ['group_id' => $group->id, 'role' => 'editor', 'own_cards_only' => true])
            ->assertCreated()
            ->assertJsonPath('data.group.name', 'Contractors')
            ->assertJsonPath('data.group.members_count', 2)
            ->assertJsonPath('data.role', 'editor')
            ->assertJsonPath('data.own_cards_only', true);
        $this->postJson('/api/v1/spaces/FRONT/groups', ['group_id' => $group->id, 'role' => 'editor'])
            ->assertJsonValidationErrors(['group_id' => __('selen.groups.already_granted')]);

        $this->getJson('/api/v1/spaces/FRONT/groups')->assertOk()->assertJsonCount(1, 'data');
        $this->patchJson("/api/v1/spaces/FRONT/groups/{$group->id}", ['own_cards_only' => false])
            ->assertOk()->assertJsonPath('data.own_cards_only', false)->assertJsonPath('data.role', 'editor');
        $this->patchJson("/api/v1/spaces/FRONT/groups/{$group->id}", ['role' => 'admin', 'own_cards_only' => true])->assertUnprocessable();
        $this->deleteJson("/api/v1/spaces/FRONT/groups/{$group->id}")->assertNoContent();
        $this->deleteJson("/api/v1/spaces/FRONT/groups/{$group->id}")->assertNotFound();

        expect(EventLogEntry::query()->where('event_type', 'like', 'space.group_%')->orderBy('id')->pluck('event_type')->all())
            ->toBe(['space.group_added', 'space.group_restriction_changed', 'space.group_removed']);
    });

    it('архивную группу добавить нельзя, а её доступ остаётся в списке с пометкой', function () {
        $archived = makeGroup(['archived_at' => now()]);
        grantGroup($this->space, $kept = makeGroup(), SpaceRole::Commenter);
        $kept->forceFill(['archived_at' => now()])->save();
        $this->actingAs($this->owner);

        $this->postJson('/api/v1/spaces/FRONT/groups', ['group_id' => $archived->id, 'role' => 'editor'])
            ->assertJsonValidationErrors(['group_id' => __('selen.groups.archived')]);
        $this->getJson('/api/v1/spaces/FRONT/groups')->assertJsonPath('data.0.group.archived_at', fn ($v) => $v !== null);
    });

    it('администратор через группу управляет участниками и группами, editor — нет', function () {
        $viaGroup = member();
        addToSpaceViaGroup($this->space, $viaGroup, SpaceRole::Admin);
        $editor = member();
        addToSpaceViaGroup($this->space, $editor, SpaceRole::Editor);
        $other = makeGroup();

        $this->actingAs($editor)->postJson('/api/v1/spaces/FRONT/groups', ['group_id' => $other->id, 'role' => 'commenter'])->assertForbidden();
        $this->actingAs($viaGroup)->postJson('/api/v1/spaces/FRONT/groups', ['group_id' => $other->id, 'role' => 'commenter'])->assertCreated();
        $this->actingAs($viaGroup)->postJson('/api/v1/spaces/FRONT/members', ['user_id' => member()->id, 'role' => 'editor'])->assertCreated();
        // Справочники для выбора — тоже доступны администратору через группу
        $this->actingAs($viaGroup)->getJson('/api/v1/groups/directory')->assertOk();
        $this->actingAs($viaGroup)->getJson('/api/v1/users/directory')->assertOk();
        $this->actingAs($editor)->getJson('/api/v1/groups/directory')->assertForbidden();
    });
});

describe('инвариант личного администратора', function () {
    it('администратор через группу не заменяет личного: последнего личного не исключить и не понизить', function () {
        $viaGroup = member();
        addToSpaceViaGroup($this->space, $viaGroup, SpaceRole::Admin);
        $this->actingAs($viaGroup);

        $this->deleteJson("/api/v1/spaces/FRONT/members/{$this->owner->id}")
            ->assertJsonValidationErrors(['role' => __('selen.spaces.last_admin')]);
        $this->patchJson("/api/v1/spaces/FRONT/members/{$this->owner->id}", ['role' => 'editor'])
            ->assertJsonValidationErrors(['role' => __('selen.spaces.last_admin')]);

        // Второй личный администратор — и первого уже можно понизить
        $this->postJson('/api/v1/spaces/FRONT/members', ['user_id' => $second = member()->id, 'role' => 'admin'])->assertCreated();
        $this->patchJson("/api/v1/spaces/FRONT/members/{$this->owner->id}", ['role' => 'editor'])->assertOk();
    });

    it('операции с группами инвариант не нарушают: отзыв группы-администратора разрешён', function () {
        $group = makeGroup();
        grantGroup($this->space, $group, SpaceRole::Admin);

        $this->actingAs($this->owner)->deleteJson("/api/v1/spaces/FRONT/groups/{$group->id}")->assertNoContent();
    });
});

describe('итоговые права (пример Петра)', function () {
    beforeEach(function () {
        $this->petr = member(['name' => 'Пётр']);
        addToSpace($this->space, $this->petr, SpaceRole::Commenter);
        addToSpaceViaGroup($this->space, $this->petr, SpaceRole::Editor, ownCardsOnly: true);
        $this->foreign = makeCard($this->board, 'To Do', $this->owner);
        $this->own = makeCard($this->board, 'To Do', $this->owner);
        $this->own->forceFill(['responsible_id' => $this->petr->id])->save();
    });

    it('видит все карточки, редактирует и двигает только свои', function () {
        $this->actingAs($this->petr);

        $cards = collect($this->getJson("/api/v1/boards/{$this->board->id}")->assertOk()->json('data.cards'))->keyBy('id');
        expect($cards)->toHaveCount(2)
            ->and($cards[$this->foreign->id]['can_edit'])->toBeFalse()
            ->and($cards[$this->own->id]['can_edit'])->toBeTrue();

        $this->patchJson("/api/v1/cards/FRONT-{$this->foreign->number}", ['title' => 'Чужая'])->assertForbidden();
        $this->patchJson("/api/v1/cards/FRONT-{$this->own->number}", ['title' => 'Своя'])->assertOk();
        $this->getJson("/api/v1/cards/FRONT-{$this->foreign->number}")->assertOk()
            ->assertJsonPath('data.permissions.edit', false)
            ->assertJsonPath('data.permissions.restricted', false);
        $this->getJson("/api/v1/cards/FRONT-{$this->own->number}")->assertJsonPath('data.permissions.edit', true);
        // Создать карточку может: источник editor (новая карточка — своя, он заказчик)
        $this->getJson('/api/v1/spaces/FRONT')->assertJsonPath('data.my_role', 'editor')->assertJsonPath('data.permissions.edit_cards', true);
    });

    it('без личного участия (только группа с ограничением) — только свои карточки', function () {
        DB::table('space_members')->where('user_id', $this->petr->id)->delete();
        $this->actingAs($this->petr);

        expect($this->getJson("/api/v1/boards/{$this->board->id}")->json('data.cards.*.id'))->toBe([$this->own->id]);
        $this->getJson("/api/v1/cards/FRONT-{$this->foreign->number}")->assertNotFound();
    });
});

describe('вкладка «Люди»', function () {
    it('показывает всех с доступом и откуда он: лично и через какие группы', function () {
        $olga = member(['name' => 'Ольга']);
        addToSpace($this->space, $olga, SpaceRole::Editor);
        addToGroup(makeGroup(['name' => 'Analysts']), $olga);
        grantGroup($this->space, $olga->groups()->first(), SpaceRole::Commenter);
        $viaGroupOnly = member(['name' => 'Борис']);
        addToSpaceViaGroup($this->space, $viaGroupOnly, SpaceRole::Commenter);
        // Деактивированный в группе доступа не получает и в списке не появляется
        addToGroup($olga->groups()->first(), member(['name' => 'Уволенный', 'status' => 'deactivated']));

        $people = collect($this->actingAs($this->owner)->getJson('/api/v1/spaces/FRONT/members')->assertOk()->json('data'))
            ->keyBy('user.name');

        expect($people->keys()->all())->toBe(['Анна', 'Борис', 'Ольга'])
            ->and($people['Ольга']['role'])->toBe('editor')
            ->and($people['Ольга']['personal']['role'])->toBe('editor')
            ->and($people['Ольга']['groups'])->toBe([['id' => $olga->groups()->first()->id, 'name' => 'Analysts', 'role' => 'commenter', 'own_cards_only' => false]])
            ->and($people['Борис']['personal'])->toBeNull()
            ->and($people['Борис']['groups'])->toHaveCount(1);
    });

    it('человека, у которого доступ только через группу, можно назначить в карточку и упомянуть', function () {
        $boris = member(['name' => 'Борис']);
        addToSpaceViaGroup($this->space, $boris, SpaceRole::Commenter);
        $card = makeCard($this->board, 'To Do', $this->owner);
        $this->actingAs($this->owner);

        $this->postJson("/api/v1/cards/FRONT-{$card->number}/participants", ['user_id' => $boris->id])->assertSuccessful();
        expect($this->getJson("/api/v1/cards/FRONT-{$card->number}/mentionable")->json('data.*.name'))->toContain('Борис');
        $this->getJson("/api/v1/cards/FRONT-{$card->number}")->assertJsonPath('data.participants.0.in_space', true);
    });
});

describe('подрядчик (все источники с «только своими карточками») — поправка PM', function () {
    it('видит людей без источников, не видит вкладку «Группы»; названий групп нет ни в одном ответе', function () {
        $secret = makeGroup(['name' => 'Тайная-группа-контракторов', 'description' => 'Описание-тайной-группы']);
        $contractor = member(['name' => 'Подрядчик']);
        addToGroup($secret, $contractor);
        grantGroup($this->space, $secret, SpaceRole::Editor, ownCardsOnly: true);
        $analyst = member(['name' => 'Аналитик']);
        addToSpaceViaGroup($this->space, $analyst, SpaceRole::Commenter)->forceFill(['name' => 'Analysts-группа'])->save();
        $card = makeCard($this->board, 'To Do', $contractor);
        $this->actingAs($contractor);

        $this->getJson('/api/v1/spaces/FRONT/groups')->assertForbidden();
        $people = $this->getJson('/api/v1/spaces/FRONT/members')->assertOk()->json('data');
        expect(collect($people)->pluck('user.name')->all())->toContain('Аналитик', 'Подрядчик')
            ->and(collect($people)->every(fn (array $p) => array_keys($p) === ['user']))->toBeTrue();

        $responses = [
            $this->getJson('/api/v1/spaces'),
            $this->getJson('/api/v1/spaces/FRONT'),
            $this->getJson('/api/v1/spaces/FRONT/members'),
            $this->getJson('/api/v1/spaces/FRONT/boards'),
            $this->getJson("/api/v1/boards/{$this->board->id}"),
            $this->getJson("/api/v1/cards/FRONT-{$card->number}"),
            $this->getJson("/api/v1/cards/FRONT-{$card->number}/history"),
            $this->getJson("/api/v1/cards/FRONT-{$card->number}/mentionable"),
            $this->getJson('/api/v1/spaces/FRONT/cards?search=a'),
            $this->getJson('/api/v1/auth/me'),
        ];
        foreach ($responses as $response) {
            expect($response->status())->toBeLessThan(400)
                ->and($response->getContent())->not->toContain('Тайная-группа')->not->toContain('Описание-тайной')->not->toContain('Analysts-группа');
        }
        // Подсказка @ работает как прежде: видит тех, кто видит карточку
        expect(collect($responses[7]->json('data'))->pluck('name')->all())->toContain('Аналитик', 'Подрядчик');
    });
});

describe('производительность', function () {
    it('доска и список пространств — фиксированное число запросов, сколько бы ни было групп и пространств', function () {
        config(['session.lottery' => [0, 100]]);
        $user = member();
        addToSpace($this->space, $user, SpaceRole::Editor);
        makeCard($this->board, 'To Do', $this->owner);

        $count = function (string $uri) use ($user) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($user)->getJson($uri)->assertOk();

            return count(DB::getQueryLog());
        };
        $board = "/api/v1/boards/{$this->board->id}";

        $count($board); // первый запрос дополнительно создаёт сессию
        [$boardFew, $spacesFew] = [$count($board), $count('/api/v1/spaces')];

        foreach (range(1, 5) as $i) {
            addToGroup($group = makeGroup(), $user, member());
            grantGroup($this->space, $group, SpaceRole::Commenter);
            $other = space();
            addToSpace($other, $user, SpaceRole::Commenter);
            grantGroup($other, $group, SpaceRole::Editor);
            makeBoard($other, $this->owner, BoardTemplate::Simple);
        }

        expect($count($board))->toBe($boardFew)
            ->and($count('/api/v1/spaces'))->toBe($spacesFew)
            ->and(SpaceGroup::query()->count())->toBe(10);
    });
});
