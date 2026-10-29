<?php

use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Group;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Access\AccessResolver;

/*
| Встроенная группа «Все сотрудники» (ADR-0012, «Изменения»): состав вычисляется в AccessResolver —
| каждый активный пользователь; группу нельзя архивировать, переименовать, менять её состав и делать admin.
*/

beforeEach(function () {
    $this->everyone = Group::everyone(company());
    $this->space = space(['key' => 'MGMT', 'name' => 'Management']);
    $this->spaceAdmin = member();
    addToSpace($this->space, $this->spaceAdmin, SpaceRole::Admin);
    $this->resolver = app(AccessResolver::class);
});

it('создаётся миграцией одна и помечена как встроенная', function () {
    expect(Group::query()->whereNotNull('system_key')->pluck('name')->all())->toBe(['Все сотрудники'])
        ->and($this->everyone->isSystem())->toBeTrue()
        ->and($this->everyone->members()->count())->toBe(0);
});

it('даёт доступ каждому активному пользователю, но не приглашённому и не деактивированному', function () {
    grantGroup($this->space, $this->everyone, SpaceRole::Commenter);
    $active = member();
    $invited = member(['status' => UserStatus::Invited]);
    $deactivated = member(['status' => UserStatus::Deactivated]);

    $access = $this->resolver->forSpace($active, $this->space);
    expect($access->isMember())->toBeTrue()
        ->and($access->highestRole())->toBe(SpaceRole::Commenter)
        ->and($access->sources[0]->groupId)->toBe($this->everyone->id)
        ->and($this->resolver->forSpace($invited, $this->space)->isMember())->toBeFalse()
        ->and($this->resolver->forSpace($deactivated, $this->space)->isMember())->toBeFalse()
        ->and($this->resolver->forUser($active)->keys()->all())->toBe([$this->space->id])
        ->and($this->resolver->usersWithAccess($this->space)->keys()->sort()->values()->all())
        ->toEqual(collect([$this->spaceAdmin->id, $active->id])->sort()->values()->all());

    // Личный источник и «Все сотрудники» складываются по общему правилу
    $personalAdmin = $this->resolver->forSpace($this->spaceAdmin, $this->space);
    expect($personalAdmin->sources)->toHaveCount(2)
        ->and($personalAdmin->highestRole())->toBe(SpaceRole::Admin);
});

it('режим «только свои карточки» действует и для «Все сотрудники»', function () {
    grantGroup($this->space, $this->everyone, SpaceRole::Editor, ownCardsOnly: true);

    $access = $this->resolver->forSpace(member(), $this->space);

    expect($access->isRestricted())->toBeTrue()
        ->and($access->allowsOnCard(Permission::CardUpdate, fn () => false))->toBeFalse()
        ->and($access->allowsOnCard(Permission::CardUpdate, fn () => true))->toBeTrue();
});

it('новый сотрудник сразу после принятия приглашения видит пространство, деактивированный — нет', function () {
    grantGroup($this->space, $this->everyone, SpaceRole::Commenter);
    $invitation = Invitation::factory()->withToken('welcome')->create();
    $browser = browser();

    $browser->post('/api/v1/invitations/welcome/accept', [
        'password' => 'my-new-password',
        'password_confirmation' => 'my-new-password',
    ])->assertOk();

    $browser->get('/api/v1/spaces')->assertOk()->assertJsonPath('data.*.key', ['MGMT']);
    $browser->get('/api/v1/spaces/MGMT')->assertOk()->assertJsonPath('data.my_role', 'commenter');

    $user = $invitation->user->fresh();
    $user->forceFill(['status' => UserStatus::Deactivated])->save();
    expect($this->resolver->forSpace($user, $this->space)->isMember())->toBeFalse();
});

it('нельзя архивировать, переименовать и менять состав', function () {
    $this->actingAs(admin());
    $id = $this->everyone->id;

    $this->postJson(adminPath()."groups/{$id}/archive")->assertUnprocessable()
        ->assertJsonValidationErrors(['group' => 'нельзя архивировать']);
    $this->postJson(adminPath()."groups/{$id}/members", ['user_id' => member()->id])->assertUnprocessable()
        ->assertJsonValidationErrors(['user_id' => 'автоматически']);
    $this->deleteJson(adminPath()."groups/{$id}/members/{$this->spaceAdmin->id}")->assertUnprocessable()
        ->assertJsonValidationErrors('user_id');
    $this->patchJson(adminPath()."groups/{$id}", ['name' => 'Все'])->assertUnprocessable()
        ->assertJsonValidationErrors(['name' => 'изменить нельзя']);

    // Описание менять можно; то же название — не изменение
    $this->patchJson(adminPath()."groups/{$id}", ['name' => 'Все сотрудники', 'description' => 'Весь штат'])
        ->assertOk()->assertJsonPath('data.description', 'Весь штат');

    expect($this->everyone->fresh()->archived_at)->toBeNull()
        ->and($this->everyone->members()->count())->toBe(0)
        ->and(loggedEventTypes())->toBe(['group.updated']);
});

it('выдаётся пространству ролью editor или commenter, но не admin', function () {
    $this->actingAs($this->spaceAdmin);

    $this->postJson('/api/v1/spaces/MGMT/groups', ['group_id' => $this->everyone->id, 'roles' => ['admin']])
        ->assertUnprocessable()->assertJsonValidationErrors(['roles' => 'только редактор или читатель']);

    $this->postJson('/api/v1/spaces/MGMT/groups', ['group_id' => $this->everyone->id, 'roles' => ['editor_own']])
        ->assertCreated()
        ->assertJsonPath('data.group.system', 'everyone')
        ->assertJsonPath('data.group.members_count', 1)
        ->assertJsonPath('data.roles', ['editor_own']);

    $this->patchJson("/api/v1/spaces/MGMT/groups/{$this->everyone->id}", ['roles' => ['admin']])
        ->assertUnprocessable()->assertJsonValidationErrors('roles');
    $this->patchJson("/api/v1/spaces/MGMT/groups/{$this->everyone->id}", ['roles' => ['commenter']])
        ->assertOk()->assertJsonPath('data.roles', ['commenter']);

    // Из админки («Доступ…» узла, П2d-1) — то же правило, и для папки
    $this->actingAs(admin());
    $this->putJson(adminPath().'nav-nodes/'.nodeOf($this->space)->id."/access/groups/{$this->everyone->id}", ['roles' => ['admin']])
        ->assertUnprocessable()->assertJsonValidationErrors('roles');
    $this->putJson(adminPath().'nav-nodes/'.makeFolder('Папка')->id."/access/groups/{$this->everyone->id}", ['roles' => ['commenter', 'admin']])
        ->assertUnprocessable()->assertJsonValidationErrors('roles');

    expect(loggedEventTypes())->toContain('space.group_added', 'space.group_role_changed')
        ->not->toContain('space.group_restriction_changed', 'folder.access_granted');
    expectNoPersonalDataInEventLog();
});

it('в списках — первой, число людей — активные пользователи', function () {
    member();
    member(['status' => UserStatus::Deactivated]);
    $active = User::query()->where('status', UserStatus::Active)->count();
    $this->actingAs(admin());
    makeGroup(['name' => 'Аналитики']);

    $this->getJson(adminPath().'groups')->assertOk()
        ->assertJsonPath('data.0.system', 'everyone')
        ->assertJsonPath('data.0.members_count', $active + 1)
        ->assertJsonPath('data.1.system', null);
    $this->getJson('/api/v1/companies/'.company()->id.'/groups/directory')->assertOk()
        ->assertJsonPath('data.0.name', 'Все сотрудники')
        ->assertJsonPath('data.0.system', 'everyone');
    $this->getJson(adminPath()."groups/{$this->everyone->id}")->assertOk()
        ->assertJsonPath('data.system', 'everyone')
        ->assertJsonPath('data.members', []);
});

it('сводка доступа объясняет, почему приглашённому «Все сотрудники» ещё не действует', function () {
    grantGroup($this->space, $this->everyone, SpaceRole::Commenter);
    $invited = member(['status' => UserStatus::Invited]);
    $this->actingAs(admin());

    $this->getJson(adminPath()."users/{$invited->id}/access")->assertOk()
        ->assertJsonPath('data.spaces.0.space.key', 'MGMT')
        ->assertJsonPath('data.spaces.0.sources.0.group.id', $this->everyone->id)
        ->assertJsonPath('data.spaces.0.sources.0.inactive_reason', 'user_invited')->assertJsonPath('data.groups', []);

    $this->getJson(adminPath()."users/{$this->spaceAdmin->id}/access")->assertOk()
        ->assertJsonPath('data.spaces.0.sources.1.inactive_reason', null)->assertJsonPath('data.groups.0.id', $this->everyone->id);
});
