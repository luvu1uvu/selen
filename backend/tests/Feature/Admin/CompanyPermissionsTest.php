<?php

use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;

/*
| Права компании лично и группам (docs/adr/0024-rights-2.md, П2c; решения PM 23.10, В17, и 28.10, п. 7): галочки
| у человека и у группы, выдают Владелец (любые) и администратор компании (кроме «удалять пользователей» и
| «аналитика трудозатрат»); действуют только у действующих «домов» компании. Гейт аналитики трудозатрат — по праву.
| Маршруты с правом и без — AdminAccessMatrixTest.
*/

beforeEach(function () {
    $this->owner = owner();
    $this->admin = admin();
    $this->member = member(['name' => 'Деливери']);
});

function permissionsOf(User $user): array
{
    return collect(test()->getJson(adminPath()."users/{$user->id}/permissions")->assertOk()->json('data'))
        ->keyBy('permission')->all();
}

it('администратор выдаёт «приглашать» лично: у участника появляется «Администрирование» только с приглашениями', function () {
    $this->actingAs($this->admin)
        ->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.invite_users']])
        ->assertOk();

    $me = $this->actingAs($this->member)->getJson('/api/v1/auth/me')->assertOk();
    expect($me->json('data.role'))->toBe('member')
        ->and($me->json('data.admin_companies.0.permissions'))->toBe(['company.invite_users'])
        // У кого компания одна — названия нет
        ->and($me->json('data.admin_companies.0.name'))->toBeNull();

    Notification::fake();
    $this->postJson(adminPath().'invitations', ['name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member'])->assertCreated();
    $this->getJson(adminPath().'users')->assertForbidden();

    expect(EventLogEntry::query()->where('event_type', 'company.permission_granted')->sole()->payload)
        ->toEqual(['permission' => 'company.invite_users', 'user_id' => $this->member->id]);
});

it('через группу и «Все сотрудники» — права всех новых сотрудников; группа в архиве и убранный из компании — нет', function () {
    $group = addToGroup(makeGroup(['name' => 'Менеджмент']), $this->member);
    $this->actingAs($this->admin)
        ->putJson(adminPath()."groups/{$group->id}/permissions", ['permissions' => ['company.view_event_log']])
        ->assertOk()->assertJsonFragment(['permission' => 'company.view_event_log', 'granted' => true, 'editable' => true]);
    $this->putJson(adminPath().'groups/'.Group::everyone(company())->id.'/permissions', ['permissions' => ['company.invite_users']])
        ->assertOk();

    expect(company()->permissionsOf($this->member)->permissions())->toEqualCanonicalizing(['company.view_event_log', 'company.invite_users']);
    $newcomer = member();
    expect(company()->permissionsOf($newcomer)->permissions())->toBe(['company.invite_users']);

    // Откуда право — видно у человека
    $rows = permissionsOf($this->member);
    expect($rows['company.view_event_log']['groups'][0]['name'])->toBe('Менеджмент')
        ->and($rows['company.view_event_log']['personal'])->toBeFalse()
        ->and($rows['company.view_event_log']['effective'])->toBeTrue();

    $group->forceFill(['archived_at' => now()])->save();
    company()->forgetResolvedPermissions();
    expect(company()->permissionsOf($this->member)->permissions())->toBe(['company.invite_users']);

    $this->postJson(adminPath()."users/{$newcomer->id}/deactivate")->assertOk();
    company()->forgetResolvedPermissions();
    expect(company()->permissionsOf($newcomer->fresh())->permissions())->toBe([]);
});

it('«удалять пользователей» и «аналитику трудозатрат» выдаёт только Владелец', function () {
    $this->actingAs($this->admin);
    $rows = permissionsOf($this->member);
    expect($rows['company.view_time_analytics']['editable'])->toBeFalse()
        ->and($rows['company.invite_users']['editable'])->toBeTrue()
        // «Удалять пользователей» (LATER-105) и «управлять ролями» (П2e) появятся со своими экранами
        ->and($rows)->not->toHaveKey('company.delete_users')->not->toHaveKey('company.manage_roles');

    $this->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.view_time_analytics']])
        ->assertUnprocessable()->assertJsonValidationErrors(['permissions' => __('selen.company_permissions.owner_only')]);

    $this->actingAs($this->owner)
        ->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.view_time_analytics']])
        ->assertOk();
    // Администратор при сохранении своих галочек право Владельца не снимает
    $this->actingAs($this->admin)
        ->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.invite_users']])
        ->assertOk();
    expect(company()->permissionsOf($this->member)->permissions())->toEqualCanonicalizing(['company.view_time_analytics', 'company.invite_users']);
});

it('гейт аналитики трудозатрат — по праву: лично, через группу; без права — нет (ADR-0017, «Изменения»)', function () {
    $gate = fn (User $user) => Gate::forUser($user)->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS, company());
    $viaGroup = member();
    $this->actingAs($this->owner);
    $this->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.view_time_analytics']])->assertOk();
    $group = addToGroup(makeGroup(), $viaGroup);
    $this->putJson(adminPath()."groups/{$group->id}/permissions", ['permissions' => ['company.view_time_analytics']])->assertOk();
    company()->forgetResolvedPermissions();

    expect($gate($this->owner))->toBeTrue()
        ->and($gate($this->member))->toBeTrue()
        ->and($gate($viaGroup))->toBeTrue()
        ->and($gate($this->admin))->toBeFalse()
        ->and($gate(member()))->toBeFalse()
        // Право одной компании другую не открывает
        ->and(Gate::forUser($this->member)->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS, otherCompany()))->toBeFalse();
});

it('права компании не смотрят и не меняют участник с правами; у Владельца и гостя их не меняют', function () {
    $this->actingAs($this->admin)->putJson(adminPath()."users/{$this->member->id}/permissions", ['permissions' => ['company.manage_users']])->assertOk();
    $other = member();

    $this->actingAs($this->member)->getJson(adminPath()."users/{$other->id}/permissions")->assertForbidden();
    $this->actingAs($this->admin)->getJson(adminPath()."users/{$this->owner->id}/permissions")->assertForbidden();
    $guest = User::factory()->inCompany(otherCompany())->guestIn(company())->create();
    $this->getJson(adminPath()."users/{$guest->id}/permissions")->assertForbidden();
});
