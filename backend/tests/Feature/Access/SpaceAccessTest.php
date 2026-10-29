<?php

use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\Space;
use App\Services\Access\AccessResolver;
use App\Services\Cards\CardVisibility;
use Illuminate\Support\Facades\DB;

/*
| Итоговые права по источникам (ADR-0012, ADR-0024): AccessResolver и SpaceAccess без HTTP, по правам каталога.
*/

beforeEach(function () {
    $this->space = space();
    $this->user = member();
    $this->resolver = app(AccessResolver::class);
    $this->editCards = Permission::CardUpdate;
});

it('без источников доступа нет', function () {
    $access = $this->resolver->forSpace($this->user, $this->space);

    expect($access->isMember())->toBeFalse()
        ->and($access->highestRole())->toBeNull()
        ->and($access->isRestricted())->toBeFalse()
        ->and(app(CardVisibility::class)->canSee($this->user, makeCard(makeBoard($this->space, admin()), 'To Do', admin())))->toBeFalse();
});

it('личный источник и группы складываются, итоговая роль — самая сильная', function () {
    addToSpace($this->space, $this->user, SpaceRole::Commenter);
    $group = addToSpaceViaGroup($this->space, $this->user, SpaceRole::Editor, ownCardsOnly: true);

    $access = $this->resolver->forSpace($this->user, $this->space);

    expect($access->sources)->toHaveCount(2)
        ->and($access->personalSources()[0]->legacyRole())->toBe(SpaceRole::Commenter)
        ->and($access->sources[1]->groupId)->toBe($group->id)
        ->and($access->highestRole())->toBe(SpaceRole::Editor)
        ->and($access->canSeeAllCards())->toBeTrue()
        ->and($access->allows($this->editCards))->toBeTrue()
        ->and($access->allowsOnCard($this->editCards, fn () => false))->toBeFalse()
        ->and($access->allowsOnCard($this->editCards, fn () => true))->toBeTrue();
});

it('ограничение одного источника не сочетается с ролью другого (пример Ольги и Петра)', function () {
    // Ольга: группа commenter + лично editor — редактирует всё
    $olga = member();
    addToSpaceViaGroup($this->space, $olga, SpaceRole::Commenter);
    addToSpace($this->space, $olga, SpaceRole::Editor);
    expect($this->resolver->forSpace($olga, $this->space)->allowsOnCard($this->editCards, fn () => false))->toBeTrue();

    // Две группы: commenter «только свои» + editor «только свои» — видит и редактирует только свои
    addToSpaceViaGroup($this->space, $this->user, SpaceRole::Commenter, ownCardsOnly: true);
    addToSpaceViaGroup($this->space, $this->user, SpaceRole::Editor, ownCardsOnly: true);
    $access = $this->resolver->forSpace($this->user, $this->space);
    expect($access->isRestricted())->toBeTrue()
        ->and($access->allowsOnCard($this->editCards, fn () => false))->toBeFalse();
});

it('проверка «своей» карточки вычисляется лениво — только для источника с ограничением', function () {
    addToSpace($this->space, $this->user, SpaceRole::Editor);
    $calls = 0;

    $allowed = $this->resolver->forSpace($this->user, $this->space)->allowsOnCard($this->editCards, function () use (&$calls) {
        $calls++;

        return false;
    });

    expect($allowed)->toBeTrue()->and($calls)->toBe(0);
});

it('архивная группа и деактивированный пользователь — источник не действует', function () {
    $archived = addToSpaceViaGroup($this->space, $this->user, SpaceRole::Admin);
    $archived->forceFill(['archived_at' => now()])->save();
    expect($this->resolver->forSpace($this->user, $this->space)->isMember())->toBeFalse();

    $gone = member(['status' => 'deactivated']);
    addToSpaceViaGroup($this->space, $gone, SpaceRole::Editor);
    expect($this->resolver->forSpace($gone, $this->space)->isMember())->toBeFalse()
        ->and($this->resolver->usersWithAccess($this->space)->keys()->all())->not->toContain($gone->id);
});

it('списки: права во всех пространствах и подзапрос видимых пространств', function () {
    $other = space();
    $hidden = space();
    addToSpace($this->space, $this->user, SpaceRole::Commenter);
    addToSpaceViaGroup($other, $this->user, SpaceRole::Admin);

    $accesses = $this->resolver->forUser($this->user);

    expect($accesses->keys()->sort()->values()->all())->toBe(collect([$this->space->id, $other->id])->sort()->values()->all())
        ->and($accesses[$other->id]->highestRole())->toBe(SpaceRole::Admin)
        ->and(Space::query()->visibleTo($this->user)->pluck('id')->all())->not->toContain($hidden->id)
        ->and($this->resolver->managesAccessIn($this->user, company()))->toBeTrue();
});

it('кеш прав живёт на экземпляре пространства', function () {
    addToSpace($this->space, $this->user, SpaceRole::Editor);
    expect($this->space->roleOf($this->user))->toBe(SpaceRole::Editor);

    DB::table('access_grants')->where('user_id', $this->user->id)->delete();
    expect($this->space->roleOf($this->user))->toBe(SpaceRole::Editor);

    $this->space->forgetResolvedAccess();
    expect($this->space->roleOf($this->user))->toBeNull()
        ->and(Space::query()->find($this->space->id)->accessOf($this->user)->isMember())->toBeFalse();
});

it('видимость карточки: «своя» при ограничении во всех источниках', function () {
    addToSpaceViaGroup($this->space, $this->user, SpaceRole::Editor, ownCardsOnly: true);
    $owner = admin();
    $board = makeBoard($this->space, $owner);
    $foreign = makeCard($board, 'To Do', $owner);
    $own = makeCard($board, 'To Do', $owner);
    Card::query()->whereKey($own->id)->update(['customer_id' => $this->user->id]);

    $visibility = app(CardVisibility::class);

    expect($visibility->canSee($this->user, Card::query()->find($foreign->id)))->toBeFalse()
        ->and($visibility->canSee($this->user, Card::query()->find($own->id)))->toBeTrue();
});
