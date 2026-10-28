<?php

use App\Enums\BoardTemplate;
use App\Enums\EventType;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Enums\UserStatus;
use App\Models\AccessGrant;
use App\Models\CompanyPermissionGrant;
use App\Models\EventLogEntry;
use App\Models\Invitation;
use App\Models\User;
use App\Notifications\AccessOpenedNotification;
use App\Notifications\InvitationNotification;
use App\Providers\AppServiceProvider;
use App\Services\EventLog\EventRecorder;
use Database\Factories\UserFactory;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Notification;

/*
| Деактивация в компании, отключение учётной записи Владельцем, передача доступа, «спящие» выдачи бывшего Владельца,
| приглашение существующего сотрудника (docs/adr/0024-rights-2.md, П2c; решения PM 28.10, п. 2, 3, 5, 6).
*/

beforeEach(function () {
    $this->owner = owner();
    $this->admin = admin();
    $this->second = otherCompany(['name' => 'Компания 2']);
});

describe('деактивация в компании', function () {
    it('единственный «дом»: вход закрыт, сеансы завершены; возврат открывает вход', function () {
        $user = member(['email' => 'boris@selen.test']);
        $session = browser();
        $session->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$user->id}/deactivate")->assertOk()
            ->assertJsonPath('data.status', 'deactivated');
        expect($user->fresh()->status)->toBe(UserStatus::Deactivated);
        $session->get('/api/v1/auth/me')->assertUnauthorized();

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$user->id}/reactivate")->assertOk()->assertJsonPath('data.status', 'active');
        expect($user->fresh()->isActive())->toBeTrue();
    });

    it('статус в карточках, «Людях» и группах — по компании пространства: в своей компании B он активен', function () {
        $both = member(['name' => 'Дважды']);
        $both->companies()->attach($this->second->id, ['kind' => 'home']);
        $space = space(['key' => 'DEV']);
        addToSpace($space, $this->admin, SpaceRole::Admin);
        addToSpace($space, $both, SpaceRole::Editor);
        $card = makeCard(makeBoard($space, $this->admin, BoardTemplate::Simple), 'To Do', $this->admin);
        $card->forceFill(['responsible_id' => $both->id])->save();
        $sales = space(['key' => 'SALES', 'company_id' => $this->second->id]);
        $secondAdmin = admin(company: $this->second);
        addToSpace($sales, $secondAdmin, SpaceRole::Admin);
        addToSpace($sales, $both, SpaceRole::Editor);

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$both->id}/deactivate")->assertOk();

        // В A — «деактивирован» (и в «Людях» он остаётся без доступа, ради истории)
        $this->getJson("/api/v1/cards/{$card->key()}")->assertOk()->assertJsonPath('data.responsible.status', 'deactivated');
        $person = collect($this->getJson('/api/v1/spaces/DEV/members')->json('data'))->firstWhere('user.id', $both->id);
        expect($person['user']['status'])->toBe('deactivated');
        // В B — активен
        $person = collect($this->actingAs($secondAdmin)->getJson('/api/v1/spaces/SALES/members')->json('data'))->firstWhere('user.id', $both->id);
        expect($person['user']['status'])->toBe('active');
    });

    it('с передачей доступа: личные роли, группы и права компании уходящего копируются преемнику', function () {
        $leaving = member(['name' => 'Уходящий']);
        $successor = member(['name' => 'Преемник']);
        $dev = space(['key' => 'DEV']);
        $ops = space(['key' => 'OPS']);
        $mkt = space(['key' => 'MKT']);
        addToSpace($dev, $leaving, SpaceRole::Admin);
        addToSpace($dev, $successor, SpaceRole::Editor);      // у уходящего — управление доступом: преемник получит его роль
        addToSpace($ops, $leaving, SpaceRole::Commenter);
        addToSpace($ops, $successor, SpaceRole::Editor);      // своя роль остаётся
        addToSpace($mkt, $leaving, StandardRole::EditorOwnCards); // новой — копия
        $group = addToGroup(makeGroup(['name' => 'Дежурные']), $leaving);
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $leaving->id, 'permission' => 'company.invite_users']);

        $this->actingAs($this->admin)
            ->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $successor->id])
            ->assertOk();

        $role = fn ($space) => AccessGrant::query()->onSpace($space)->where('user_id', $successor->id)->sole()->standardRole();
        expect($role($dev))->toBe(StandardRole::Admin)
            ->and($role($ops))->toBe(StandardRole::Editor)
            ->and($role($mkt))->toBe(StandardRole::EditorOwnCards)
            ->and($group->members()->whereKey($successor->id)->exists())->toBeTrue()
            ->and(company()->permissionsOf($successor)->permissions())->toBe(['company.invite_users'])
            // Копирование: у ушедшего всё остаётся «спящим» — вернётся, и права вернутся
            ->and(AccessGrant::query()->where('user_id', $leaving->id)->count())->toBe(3);
        expect(EventLogEntry::query()->where('event_type', 'user.access_transferred')->sole()->payload)
            ->toEqual(['to_user_id' => $successor->id]);
        expectNoPersonalDataInEventLog();
    });

    it('преемник — только активный сотрудник этой компании (не сам уходящий, не человек другой компании)', function () {
        $leaving = member();
        $stranger = member(company: $this->second);

        $this->actingAs($this->admin);
        $this->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $stranger->id])
            ->assertJsonValidationErrors('successor_id');
        $this->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $leaving->id])
            ->assertJsonValidationErrors(['successor_id' => __('selen.users.successor_invalid')]);
        expect($leaving->fresh()->isActive())->toBeTrue();
    });

    it('гостя не деактивируют — его убирают', function () {
        $guest = User::factory()->inCompany($this->second)->guestIn(company())->create();

        $this->actingAs($this->owner)->postJson(adminPath()."users/{$guest->id}/deactivate")
            ->assertJsonValidationErrors(['user' => __('selen.users.guest_not_deactivated')]);
    });
});

describe('отключение учётной записи Владельцем', function () {
    it('закрывает вход во всех компаниях; членство не меняется; администратор вернуть не может; событие — во всех его компаниях', function () {
        $both = member(['email' => 'both@selen.test']);
        $both->companies()->attach($this->second->id, ['kind' => 'home']);
        $secondAdmin = admin(company: $this->second);

        $this->actingAs($this->owner)->postJson(adminPath()."users/{$both->id}/block")->assertOk()
            ->assertJsonPath('data.blocked', true)->assertJsonPath('data.status', 'deactivated');
        expect($both->fresh()->status)->toBe(UserStatus::Deactivated);
        $this->post('/api/v1/auth/logout');
        $this->postJson('/api/v1/auth/login', ['email' => 'both@selen.test', 'password' => UserFactory::PASSWORD])->assertUnprocessable();

        // Администратор компании видит «Отключён Владельцем» и вернуть не может
        $row = collect($this->actingAs($this->admin)->getJson(adminPath().'users')->json('data'))->firstWhere('id', $both->id);
        expect($row['blocked'])->toBeTrue()->and($row['permissions']['reactivate'])->toBeTrue();
        $this->postJson(adminPath()."users/{$both->id}/reactivate")->assertUnprocessable();
        $this->postJson(adminPath()."users/{$both->id}/unblock")->assertForbidden();

        // Событие без компании «о человеке» — в журналах обеих его компаний
        foreach ([[$this->admin, company()], [$secondAdmin, $this->second]] as [$actor, $company]) {
            expect(collect($this->actingAs($actor)->getJson(adminPath($company).'events')->json('data'))->pluck('event_type'))
                ->toContain('user.blocked');
        }

        $this->actingAs($this->owner)->postJson(adminPath()."users/{$both->id}/unblock")->assertOk()->assertJsonPath('data.status', 'active');
        expect($both->fresh()->isActive())->toBeTrue();
    });

    it('предупреждение «пространство без администратора» — по всем его компаниям', function () {
        $both = member();
        $both->companies()->attach($this->second->id, ['kind' => 'home']);
        addToSpace(space(['key' => 'DEV']), $both, SpaceRole::Admin);
        addToSpace(space(['key' => 'SALES', 'company_id' => $this->second->id]), $both, SpaceRole::Admin);

        $this->actingAs($this->owner);
        $keys = fn (string $query) => collect($this->getJson(adminPath()."users/{$both->id}/deactivation-impact{$query}")->assertOk()
            ->json('data.last_admin_spaces'))->pluck('key')->all();
        expect($keys(''))->toBe(['DEV'])
            ->and($keys('?account=1'))->toEqualCanonicalizing(['DEV', 'SALES']);
        $this->actingAs($this->admin)->getJson(adminPath()."users/{$both->id}/deactivation-impact?account=1")->assertForbidden();
    });
});

describe('передача владения: «спящие» выдачи бывшего Владельца (решение PM 28.10, п. 6)', function () {
    it('его личный доступ в компаниях, где он не «дом», снимается; окно заранее показывает, к чему', function () {
        $sales = space(['key' => 'SALES', 'company_id' => $this->second->id]);
        addToSpace($sales, $this->owner, SpaceRole::Admin);
        $dev = space(['key' => 'DEV']);
        addToSpace($dev, $this->owner, SpaceRole::Admin);
        $heir = member();

        $this->actingAs($this->owner);
        $impact = $this->getJson(adminPath()."users/{$heir->id}/transfer-impact")->assertOk();
        expect(collect($impact->json('data.lost_spaces'))->pluck('key')->all())->toBe(['SALES'])
            ->and(collect($impact->json('data.unmanaged_spaces'))->pluck('key')->all())->toBe(['SALES']);

        $this->postJson(adminPath()."users/{$heir->id}/transfer-ownership", ['password' => UserFactory::PASSWORD])->assertOk();

        expect(AccessGrant::query()->onSpace($sales)->where('user_id', $this->owner->id)->exists())->toBeFalse()
            ->and(AccessGrant::query()->onSpace($dev)->where('user_id', $this->owner->id)->exists())->toBeTrue();
        // Позже его добавляют сотрудником второй компании — прежний доступ не оживает
        Notification::fake();
        $this->actingAs(admin(company: $this->second))->postJson(adminPath($this->second).'invitations', [
            'name' => 'Бывший', 'email' => $this->owner->email, 'role' => 'member',
        ])->assertCreated()->assertJsonPath('data.result', 'added');
        $this->actingAs($this->owner->fresh())->getJson('/api/v1/spaces/SALES')->assertNotFound();
    });
});

describe('приглашение существующего сотрудника (В8)', function () {
    beforeEach(fn () => Notification::fake());

    it('email сотрудника другой компании — сразу второй «дом»; письмо «Вам открыт доступ» со ссылкой на вход', function () {
        $oleg = member(['name' => 'Олег', 'email' => 'oleg@selen.test'], $this->second);
        $dev = space(['key' => 'DEV']);

        $this->actingAs($this->admin)->postJson(adminPath().'invitations', [
            'name' => 'Другое имя', 'email' => 'OLEG@selen.test', 'role' => 'member',
            'spaces' => [['space_id' => $dev->id, 'role' => 'editor']],
        ])->assertCreated()
            ->assertJsonPath('data.result', 'added')
            ->assertJsonPath('data.user.name', 'Олег')
            ->assertJsonPath('data.invitation', null);

        expect($oleg->fresh()->name)->toBe('Олег')
            ->and(Invitation::query()->count())->toBe(0);
        $this->actingAs($oleg)->getJson('/api/v1/spaces/DEV')->assertOk()->assertJsonPath('data.my_role', 'editor');
        Notification::assertSentTo($oleg, AccessOpenedNotification::class, fn (AccessOpenedNotification $n) => $n->toMail($oleg)->actionUrl === 'http://localhost/login');
        expect(EventLogEntry::query()->where('event_type', 'user.added_to_company')->sole()->company_id)->toBe(company()->id);
    });

    it('гость этой компании становится её сотрудником — его доступ остаётся', function () {
        $guest = User::factory()->inCompany($this->second)->guestIn(company())->create(['email' => 'guest@selen.test']);
        addToSpace(space(['key' => 'DEV']), $guest, SpaceRole::Commenter);

        $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Гость', 'email' => 'guest@selen.test', 'role' => 'member'])
            ->assertCreated()->assertJsonPath('data.result', 'added');

        $row = collect($this->getJson(adminPath().'users')->json('data'))->firstWhere('id', $guest->id);
        expect($row['guest'])->toBeNull()->and($row['status'])->toBe('active');
        $this->actingAs($guest)->getJson('/api/v1/spaces/DEV')->assertOk();
    });

    it('ушедший отовсюду сотрудник, добавленный в компанию, снова может войти; ещё не задавший пароль — получает приглашение', function () {
        $gone = User::factory()->inCompany($this->second)->deactivated()->create(['email' => 'gone@selen.test']);
        $pending = User::factory()->inCompany($this->second)->invited()->create(['email' => 'pending@selen.test']);

        $this->actingAs($this->admin);
        $this->postJson(adminPath().'invitations', ['name' => 'X', 'email' => 'gone@selen.test', 'role' => 'member'])
            ->assertCreated()->assertJsonPath('data.result', 'added');
        expect($gone->fresh()->isActive())->toBeTrue();

        $this->postJson(adminPath().'invitations', ['name' => 'Y', 'email' => 'pending@selen.test', 'role' => 'member'])
            ->assertCreated()->assertJsonPath('data.result', 'invited')->assertJsonPath('data.invitation.state', 'pending');
        Notification::assertSentTo($pending, InvitationNotification::class);
        expect($pending->fresh()->status)->toBe(UserStatus::Invited);
    });

    it('отключённый Владельцем добавляется, но войти по-прежнему не может', function () {
        $blocked = User::factory()->inCompany($this->second)->blocked()->create(['email' => 'blocked@selen.test']);

        $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Z', 'email' => 'blocked@selen.test', 'role' => 'member'])
            ->assertCreated();
        expect($blocked->fresh()->status)->toBe(UserStatus::Deactivated);
    });

    it('доступ к пространству при приглашении — только там, где приглашающий выдаёт доступ', function () {
        $inviter = member();
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $inviter->id, 'permission' => 'company.invite_users']);
        $mine = space(['key' => 'MINE']);
        addToSpace($mine, $inviter, SpaceRole::Admin);
        $other = space(['key' => 'OTHER']);

        $this->actingAs($inviter);
        expect(collect($this->getJson(adminPath().'grantable-spaces')->assertOk()->json('data'))->pluck('key')->all())->toBe(['MINE']);
        $this->postJson(adminPath().'invitations', [
            'name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member',
            'spaces' => [['space_id' => $other->id, 'role' => 'editor']],
        ])->assertJsonValidationErrors(['spaces.0.space_id' => __('selen.spaces.not_found')]);
        $this->postJson(adminPath().'invitations', [
            'name' => 'Новый', 'email' => 'new@selen.test', 'role' => 'member',
            'spaces' => [['space_id' => $mine->id, 'role' => 'editor']],
        ])->assertCreated();
        expect(AccessGrant::query()->onSpace($mine)->whereHas('user', fn ($q) => $q->where('email', 'new@selen.test'))->exists())->toBeTrue();
    });

    it('в «Приглашениях» и при повторе — последнее приглашение этой компании (аудит П2b-2, S-4)', function () {
        $pending = User::factory()->invited()->create(['email' => 'p@selen.test']);
        $pending->companies()->attach($this->second->id, ['kind' => 'home']);
        $mine = Invitation::factory()->create(['company_id' => company()->id, 'user_id' => $pending->id]);
        Invitation::factory()->create(['company_id' => $this->second->id, 'user_id' => $pending->id]);

        $this->actingAs($this->admin)->getJson(adminPath().'invitations')->assertOk()
            ->assertJsonPath('data.0.id', $mine->id)->assertJsonPath('data.0.can_resend', true);
        $this->postJson(adminPath()."invitations/{$mine->id}/resend")->assertSuccessful();
    });
});

it('события «о человеке» убранного из компании: пока он работает в другой — не видны; ушёл отовсюду — видны только до ухода', function () {
    $both = member();
    $both->companies()->attach($this->second->id, ['kind' => 'home']);
    $secondAdmin = admin(company: $this->second);
    $recorder = app(EventRecorder::class);
    $before = $recorder->record(EventType::PasswordChanged, $both, $both);
    $this->travel(1)->minutes();
    $this->actingAs($this->admin)->postJson(adminPath()."users/{$both->id}/deactivate")->assertOk();
    $this->travel(1)->minutes();
    $after = $recorder->record(EventType::PasswordChanged, $both, $both);

    $ids = fn (User $actor, $company) => collect($this->actingAs($actor)->getJson(adminPath($company).'events')->json('data'))->pluck('id');
    expect($ids($this->admin, company()))->not->toContain($before->id)->not->toContain($after->id)
        ->and($ids($secondAdmin, $this->second))->toContain($before->id, $after->id);

    // Ушёл и из второй — первой видны события до его ухода из неё и после ухода отовсюду, но не то, что было, когда он
    // работал только во второй
    $this->travel(1)->minutes();
    $this->actingAs($secondAdmin)->postJson(adminPath($this->second)."users/{$both->id}/deactivate")->assertOk();
    $this->travel(1)->minutes();
    $gone = $recorder->record(EventType::LoginFailed, null, $both, ['reason' => 'deactivated']);
    expect($ids($this->admin, company()))->toContain($before->id, $gone->id)->not->toContain($after->id);
});

describe('ревью П2c-1: передача доступа и права компании не выдают лишнего', function () {
    it('себя преемником не назначить; участник с одним «управлять пользователями» передать доступ не может', function () {
        $leaving = member();
        addToSpace(space(['key' => 'DEV']), $leaving, SpaceRole::Admin);
        $manager = member();
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $manager->id, 'permission' => 'company.manage_users']);

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $this->admin->id])
            ->assertJsonValidationErrors(['successor_id' => __('selen.users.successor_invalid')]);
        $this->actingAs($manager)->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => member()->id])->assertForbidden();
        // Без передачи — может
        $this->actingAs($manager)->postJson(adminPath()."users/{$leaving->id}/deactivate")->assertOk();
    });

    it('права, которые выдаёт только Владелец, передаёт только Владелец', function () {
        foreach ([[$this->admin, false], [$this->owner, true]] as [$actor, $copied]) {
            $leaving = member();
            $successor = member();
            CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $leaving->id, 'permission' => 'company.view_time_analytics']);
            CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $leaving->id, 'permission' => 'company.invite_users']);

            $this->actingAs($actor)->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $successor->id])->assertOk();
            expect(company()->permissionsOf($successor)->allows(Permission::CompanyViewTimeAnalytics))->toBe($copied)
                ->and(company()->permissionsOf($successor)->allows(Permission::CompanyInviteUsers))->toBeTrue();
        }
    });

    it('администратор сохраняет «Права компании» человека, у которого есть право от Владельца; права администратора меняет только Владелец', function () {
        $dina = member();
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $dina->id, 'permission' => 'company.view_time_analytics']);

        $this->actingAs($this->admin)->putJson(adminPath()."users/{$dina->id}/permissions", [
            'permissions' => ['company.view_time_analytics', 'company.invite_users'],
        ])->assertOk();
        expect(company()->permissionsOf($dina)->permissions())->toEqualCanonicalizing(['company.view_time_analytics', 'company.invite_users']);

        $other = admin();
        $this->putJson(adminPath()."users/{$other->id}/permissions", ['permissions' => ['company.invite_users']])->assertForbidden();
        $this->putJson(adminPath()."users/{$this->admin->id}/permissions", ['permissions' => ['company.invite_users']])->assertForbidden();
        $this->actingAs($this->owner)->putJson(adminPath()."users/{$other->id}/permissions", ['permissions' => ['company.view_time_analytics']])->assertOk();
    });

    it('гостю роль в компании не меняют; бывший Владелец сохраняет выдачи там, где он гость', function () {
        $guest = User::factory()->inCompany($this->second)->guestIn(company())->create();
        $this->actingAs($this->owner)->patchJson(adminPath()."users/{$guest->id}/role", ['role' => 'admin'])
            ->assertJsonValidationErrors(['role' => __('selen.users.guest_no_role')]);

        // Владелец — гость «Компании 2» (был им до владения), доступ к SALES — законный
        $this->owner->companies()->newPivotStatement()->insert(['company_id' => $this->second->id, 'user_id' => $this->owner->id, 'kind' => 'guest', 'created_at' => now(), 'updated_at' => now()]);
        $sales = space(['key' => 'SALES', 'company_id' => $this->second->id]);
        addToSpace($sales, $this->owner, SpaceRole::Commenter);
        $this->postJson(adminPath().'users/'.member()->id.'/transfer-ownership', ['password' => UserFactory::PASSWORD])->assertOk();
        expect(AccessGrant::query()->onSpace($sales)->where('user_id', $this->owner->id)->exists())->toBeTrue();
    });

    it('гостем не стать, если в компании уже есть выдача, которой гостю нельзя (БД)', function () {
        // Владелец без «дома» во второй компании — администратор её пространства
        addToSpace(space(['key' => 'SALES', 'company_id' => $this->second->id]), $this->owner, SpaceRole::Admin);

        expect(fn () => DB::transaction(fn () => $this->owner->companies()->newPivotStatement()->insert([
            'company_id' => $this->second->id, 'user_id' => $this->owner->id, 'kind' => 'guest', 'created_at' => now(), 'updated_at' => now(),
        ])))->toThrow(QueryException::class, 'a guest gets only');
    });

    it('срок гостя — не раньше сегодняшнего дня в часовом поясе того, кто задаёт', function () {
        $this->travelTo(now()->setTimezone('UTC')->setTime(22, 30));
        $this->admin->forceFill(['timezone' => 'Asia/Novosibirsk'])->save();   // у него уже завтра
        member(['email' => 'g@selen.test'], $this->second);
        $todayUtc = now('UTC')->format('Y-m-d');

        $this->actingAs($this->admin)->postJson(adminPath().'guests', [
            'email' => 'g@selen.test', 'expires_on' => $todayUtc,
            'spaces' => [['space_id' => space(['key' => 'DEV'])->id, 'role' => 'commenter']],
        ])->assertJsonValidationErrors('expires_on');
    });
});

describe('аудит П2c-1: права Владельца и группы, журнал, письма', function () {
    it('S-1: в группу с правом Владельца добавляет только Владелец; передача доступа администратором её не копирует', function () {
        $group = makeGroup(['name' => 'Аналитики']);
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'group_id' => $group->id, 'permission' => 'company.view_time_analytics']);
        $gate = fn (User $user) => Gate::forUser($user)->allows(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS, company());

        $this->actingAs($this->admin)->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => $this->admin->id])->assertForbidden();
        expect($gate($this->admin))->toBeFalse();

        $leaving = member();
        addToGroup($group, $leaving);
        $successor = member();
        $this->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $successor->id])->assertOk();
        expect($group->members()->whereKey($successor->id)->exists())->toBeFalse()
            ->and($gate($successor))->toBeFalse();

        // Убрать из такой группы администратор может; добавить — Владелец
        $this->actingAs($this->owner)->postJson(adminPath()."groups/{$group->id}/members", ['user_id' => $successor->id])->assertOk();
        $this->actingAs($this->admin)->deleteJson(adminPath()."groups/{$group->id}/members/{$successor->id}")->assertNoContent();
    });

    it('S-2: архив и возврат группы с доступом — с «управлять доступом», с правами компании — администратор, с правом Владельца — вернуть только Владелец', function () {
        $groups = member();
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $groups->id, 'permission' => 'company.manage_groups']);
        $withAccess = makeGroup(['name' => 'С доступом']);
        grantGroup(space(['key' => 'DEV']), $withAccess, SpaceRole::Editor);
        $plain = makeGroup(['name' => 'Пустая']);
        $owners = makeGroup(['name' => 'Аналитики']);
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'group_id' => $owners->id, 'permission' => 'company.view_time_analytics']);

        $this->actingAs($groups);
        $this->postJson(adminPath()."groups/{$withAccess->id}/archive")->assertForbidden();
        $this->postJson(adminPath()."groups/{$plain->id}/archive")->assertOk();
        $this->postJson(adminPath()."groups/{$plain->id}/restore")->assertOk();

        $this->actingAs($this->admin)->postJson(adminPath()."groups/{$owners->id}/archive")->assertOk();
        $this->postJson(adminPath()."groups/{$owners->id}/restore")->assertForbidden();
        $this->actingAs($this->owner)->postJson(adminPath()."groups/{$owners->id}/restore")->assertOk();
    });

    it('S-3: журнал компании показывает входы нового сотрудника только с его прихода', function () {
        $larisa = member(['email' => 'larisa@selen.test'], $this->second);
        $recorder = app(EventRecorder::class);
        $before = $recorder->record(EventType::LoginSucceeded, $larisa, $larisa);
        $this->travel(1)->minutes();
        Notification::fake();
        $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Л', 'email' => 'larisa@selen.test', 'role' => 'member'])
            ->assertCreated()->assertJsonPath('data.result', 'added');
        $this->travel(1)->minutes();
        $after = $recorder->record(EventType::LoginSucceeded, $larisa, $larisa);

        $ids = collect($this->getJson(adminPath().'events')->assertOk()->json('data'))->pluck('id');
        expect($ids)->toContain($after->id)->not->toContain($before->id);
        // Своя (первая) компания видит всю её историю
        $ids = collect($this->actingAs(admin(company: $this->second))->getJson(adminPath($this->second).'events')->json('data'))->pluck('id');
        expect($ids)->toContain($before->id, $after->id);
    });

    it('S-4: передача доступа, когда у преемника уже есть то же право компании', function () {
        $leaving = member();
        $successor = member();
        foreach ([$leaving, $successor] as $user) {
            CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $user->id, 'permission' => 'company.invite_users']);
        }

        $this->actingAs($this->admin)->postJson(adminPath()."users/{$leaving->id}/deactivate", ['successor_id' => $successor->id])->assertOk();
        expect(CompanyPermissionGrant::query()->where('user_id', $successor->id)->count())->toBe(1);
    });

    it('S-5: отключённому Владельцем письма не уходят, повтор приглашения — отказ', function () {
        Notification::fake();
        $blocked = User::factory()->inCompany($this->second)->blocked()->create(['email' => 'b@selen.test', 'password' => null]);

        $this->actingAs($this->admin)->postJson(adminPath().'invitations', ['name' => 'Б', 'email' => 'b@selen.test', 'role' => 'member'])->assertCreated();
        Notification::assertNothingSent();
        $invitation = Invitation::query()->where('user_id', $blocked->id)->sole();
        $this->postJson(adminPath()."invitations/{$invitation->id}/resend")
            ->assertJsonValidationErrors(['invitation' => __('selen.users.blocked')]);
    });

    it('S-6: у гостя время деактивации учётной записи не показывается', function () {
        $guest = User::factory()->inCompany($this->second)->guestIn(company())->create();
        $this->actingAs(admin(company: $this->second))->postJson(adminPath($this->second)."users/{$guest->id}/deactivate")->assertOk();

        $row = collect($this->actingAs($this->admin)->getJson(adminPath().'users?status=guest')->json('data'))->sole();
        expect($row['status'])->toBe('deactivated')->and($row['deactivated_at'])->toBeNull();
    });
});
