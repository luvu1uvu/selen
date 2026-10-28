<?php

use App\Enums\EventType;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\Invitation;
use App\Models\User;
use App\Services\EventLog\EventRecorder;

/*
| Люди компании в админке («Права 2.0», П2b-2; ADR-0024):
| - Владелец — участник всех компаний: в «Пользователях», в привязке {user} адресов и в выборе людей для выдачи доступа
|   каждой компании (ему можно выдать доступ, в том числе он сам себе); в состав групп чужой компании — нет (группы —
|   только «дома»), события «о человеке» — только компаниям, где он «дом» (решение PM 23.10, п. 2);
| - человек с «домами» в нескольких компаниях: «Деактивировать» в админке компании убирает его только из неё, вход
|   закрывается, когда не осталось ни одного «дома» (П2c; до П2c — только Владелец, решение PM 26.10).
*/

beforeEach(function () {
    $this->owner = owner(['name' => 'Ольга Владелец']);
    $this->second = otherCompany(['name' => 'Компания 2']);
    $this->secondAdmin = admin(company: $this->second);
});

it('Владелец — в «Пользователях» каждой компании, его доступ в ней открывается; управлять им нельзя', function () {
    $this->actingAs($this->secondAdmin);

    $this->owner->forceFill(['last_login_at' => now()])->save();
    $row = collect($this->getJson(adminPath($this->second).'users')->assertOk()->json('data'))->firstWhere('id', $this->owner->id);
    expect($row)->not->toBeNull()
        ->and($row['role'])->toBe('owner')
        ->and($row['permissions'])->each->toBeFalse()
        // Время входов и часовой пояс Владельца — только компаниям, где он «дом» (аудит S-3)
        ->and($row['last_login_at'])->toBeNull()
        ->and($row['timezone'])->toBeNull();
    // В «Компании 1», где он «дом», — как у всех
    $home = collect($this->actingAs(admin())->getJson(adminPath().'users')->assertOk()->json('data'))->firstWhere('id', $this->owner->id);
    expect($home['last_login_at'])->not->toBeNull()
        ->and($home['timezone'])->toBe('Europe/Moscow');
    $this->actingAs($this->secondAdmin);

    // В «Все сотрудники» чужой компании Владелец не входит (её состав — «дома»)
    $this->getJson(adminPath($this->second)."users/{$this->owner->id}/access")->assertOk()
        ->assertJsonPath('data.user.role', 'owner')
        ->assertJsonPath('data.groups', [])
        ->assertJsonPath('data.spaces', []);
    $this->postJson(adminPath($this->second)."users/{$this->owner->id}/deactivate")->assertForbidden();
});

it('Владельцу в чужой компании выдают доступ к пространству; в группу её — нельзя', function () {
    $space = space(['key' => 'SEC', 'company_id' => $this->second->id]);
    addToSpace($space, $this->secondAdmin, SpaceRole::Admin);
    $group = makeGroup(['name' => 'Группа 2', 'company_id' => $this->second->id]);
    $this->actingAs($this->secondAdmin);

    $directory = fn (string $query = '') => collect($this->getJson("/api/v1/companies/{$this->second->id}/users/directory{$query}")->assertOk()->json('data'))->pluck('id');
    expect($directory())->toContain($this->owner->id)
        ->and($directory('?homes=1'))->not->toContain($this->owner->id)->toContain($this->secondAdmin->id);

    $this->postJson('/api/v1/spaces/SEC/members', ['user_id' => $this->owner->id, 'role' => 'commenter'])->assertCreated();
    $this->postJson(adminPath($this->second)."groups/{$group->id}/members", ['user_id' => $this->owner->id])
        ->assertUnprocessable()->assertJsonValidationErrors('user_id');

    // Выданный доступ работает, и его видно в сводке «Доступ»
    $this->actingAs($this->owner)->getJson('/api/v1/spaces/SEC')->assertOk();
    $this->actingAs($this->secondAdmin)->getJson(adminPath($this->second)."users/{$this->owner->id}/access")->assertOk()
        ->assertJsonPath('data.spaces.0.space.key', 'SEC')
        ->assertJsonPath('data.spaces.0.sources.0.type', 'personal');
});

it('Владелец сам выдаёт себе роль в пространстве чужой компании из её админки', function () {
    $space = space(['key' => 'SEC', 'company_id' => $this->second->id]);
    addToSpace($space, $this->secondAdmin, SpaceRole::Admin);

    $this->actingAs($this->owner)->putJson(adminPath($this->second)."spaces/{$space->id}/members/{$this->owner->id}", ['role' => 'editor'])->assertOk();
    $this->getJson('/api/v1/spaces/SEC')->assertOk()->assertJsonPath('data.my_role', 'editor');
});

it('человек другой компании (не Владелец) в привязке и справочнике по-прежнему не находится', function () {
    $stranger = member();
    $this->actingAs($this->secondAdmin);

    $this->getJson(adminPath($this->second)."users/{$stranger->id}/access")->assertNotFound();
    expect(collect($this->getJson("/api/v1/companies/{$this->second->id}/users/directory")->json('data'))->pluck('id'))
        ->not->toContain($stranger->id);
});

it('события «о человеке» Владельца — только компаниям, где он «дом»', function () {
    app(EventRecorder::class)->record(EventType::PasswordChanged, $this->owner, $this->owner);

    $types = fn (User $actor, $company) => collect($this->actingAs($actor)->getJson(adminPath($company).'events')->assertOk()->json('data'))->pluck('event_type');
    expect($types(admin(), company()))->toContain('auth.password_changed')
        ->and($types($this->secondAdmin, $this->second))->not->toContain('auth.password_changed');
});

describe('человек с «домами» в двух компаниях', function () {
    beforeEach(function () {
        $this->both = member(['name' => 'Дважды Свой']);
        $this->both->companies()->attach($this->second->id, ['kind' => 'home']);
        $this->firstAdmin = admin();
    });

    it('администратор убирает его только из своей компании; вход закрывается, когда не осталось «домов»', function () {
        $space = space(['key' => 'SEC', 'company_id' => $this->second->id]);
        addToSpace($space, $this->both, SpaceRole::Editor);
        $this->actingAs($this->secondAdmin);
        $row = collect($this->getJson(adminPath($this->second).'users')->assertOk()->json('data'))->firstWhere('id', $this->both->id);
        expect($row['permissions'])->toMatchArray(['deactivate' => true, 'reactivate' => true, 'block' => false]);

        $this->postJson(adminPath($this->second)."users/{$this->both->id}/deactivate")->assertOk()->assertJsonPath('data.status', 'deactivated');
        // Во второй компании он деактивирован и доступа нет; в первой — работает, вход открыт
        expect($this->both->fresh()->isActive())->toBeTrue();
        $this->actingAs($this->both)->getJson('/api/v1/spaces/SEC')->assertNotFound();
        $this->actingAs($this->firstAdmin);
        expect(collect($this->getJson(adminPath().'users')->json('data'))->firstWhere('id', $this->both->id)['status'])->toBe('active');

        // Убран и из первой — вход закрыт; возврат в любую из компаний снова открывает вход
        $this->postJson(adminPath()."users/{$this->both->id}/deactivate")->assertOk();
        expect($this->both->fresh()->status)->toBe(UserStatus::Deactivated);
        $this->actingAs($this->secondAdmin)->postJson(adminPath($this->second)."users/{$this->both->id}/reactivate")->assertOk();
        expect($this->both->fresh()->isActive())->toBeTrue();
        $this->actingAs($this->both)->getJson('/api/v1/spaces/SEC')->assertOk();
    });

    it('его приглашение повторяет и отзывает администратор этой компании; в «Пользователях» — только приглашение этой компании', function () {
        $this->both->forceFill(['status' => UserStatus::Invited, 'password' => null])->save();
        $invitation = Invitation::factory()->create(['company_id' => company()->id, 'user_id' => $this->both->id]);

        $this->actingAs($this->firstAdmin);
        $row = collect($this->getJson(adminPath().'users')->assertOk()->json('data'))->firstWhere('id', $this->both->id);
        expect($row['permissions']['manage_invitation'])->toBeTrue()
            ->and($row['invitation']['id'])->toBe($invitation->id);

        // Во второй компании приглашения первой не видно
        $this->actingAs($this->secondAdmin);
        $row = collect($this->getJson(adminPath($this->second).'users')->assertOk()->json('data'))->firstWhere('id', $this->both->id);
        expect($row['invitation'])->toBeNull()
            ->and(json_encode($this->getJson(adminPath($this->second).'users')->json(), JSON_UNESCAPED_UNICODE))->not->toContain($invitation->id);

        // Отзыв убирает его только из первой компании: во второй он по-прежнему приглашён
        $this->actingAs($this->firstAdmin)->postJson(adminPath()."invitations/{$invitation->id}/revoke")->assertOk();
        expect($this->both->fresh()->status)->toBe(UserStatus::Invited);
        expect(collect($this->getJson(adminPath().'users')->json('data'))->firstWhere('id', $this->both->id)['status'])->toBe('deactivated');
    });

    it('сотрудником одной компании администратор управляет, как раньше', function () {
        $single = member();

        $this->actingAs($this->firstAdmin)->postJson(adminPath()."users/{$single->id}/deactivate")->assertOk();
        expect($single->fresh()->status)->toBe(UserStatus::Deactivated);
        $this->postJson(adminPath()."users/{$single->id}/reactivate")->assertOk();
        expect($single->fresh()->isActive())->toBeTrue();
    });
});
