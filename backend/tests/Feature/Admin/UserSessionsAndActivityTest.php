<?php

use App\Enums\Permission;
use App\Models\CompanyPermissionGrant;
use App\Models\EventLogEntry;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;

/*
| П2c-2: «последняя активность» в «Пользователях» (обновляется не чаще раза в несколько минут, сортировка) и «Завершить
| все сеансы» человека.
*/

describe('последняя активность', function () {
    it('пишется при запросе вошедшего не чаще раза в несколько минут и отдаётся в ISO 8601 с Z', function () {
        Date::setTestNow('2026-10-28 10:00:00');
        $user = member();

        $this->actingAs($user)->getJson('/api/v1/navigation')->assertOk();
        expect($user->fresh()->last_seen_at->toIso8601ZuluString())->toBe('2026-10-28T10:00:00Z');

        // Через минуту — не пишется: время то же
        Date::setTestNow('2026-10-28 10:01:00');
        $queries = 0;
        DB::listen(function ($query) use (&$queries) {
            $queries += str_contains($query->sql, 'last_seen_at') ? 1 : 0;
        });
        $this->actingAs($user->fresh())->getJson('/api/v1/navigation')->assertOk();
        expect($user->fresh()->last_seen_at->toIso8601ZuluString())->toBe('2026-10-28T10:00:00Z')
            ->and($queries)->toBe(0);

        // Через 5 минут — пишется снова
        Date::setTestNow('2026-10-28 10:05:00');
        $this->actingAs($user->fresh())->getJson('/api/v1/navigation')->assertOk();
        expect($user->fresh()->last_seen_at->toIso8601ZuluString())->toBe('2026-10-28T10:05:00Z');

        $this->actingAs(admin())->getJson(adminPath().'users')->assertOk()
            ->assertJsonFragment(['id' => $user->id, 'last_seen_at' => '2026-10-28T10:05:00Z']);
    });

    it('не пишется без входа и не попадает в журнал событий', function () {
        $user = member();

        $this->getJson('/api/v1/navigation')->assertUnauthorized();
        $this->actingAs($user)->getJson('/api/v1/navigation')->assertOk();

        expect(EventLogEntry::query()->count())->toBe(0)
            ->and($user->fresh()->updated_at->equalTo($user->updated_at))->toBeTrue();
    });

    it('сортировка по последней активности: недавние сверху, без времени — в конце; скрытое время не влияет на порядок', function () {
        $admin = admin(['name' => 'Админ']);
        $recent = member(['name' => 'Яна']);
        $old = member(['name' => 'Борис']);
        $never = member(['name' => 'Вера']);
        // Убран из этой компании, но работает в другой: его время скрыто — и в порядке строк его нет
        $removed = member(['name' => 'Глеб']);
        $removed->companies()->updateExistingPivot(company()->id, ['deactivated_at' => now()]);
        $removed->companies()->attach(otherCompany()->id, ['kind' => 'home']);
        foreach ([$recent->id => '2026-10-28 09:00:00', $old->id => '2026-10-20 09:00:00', $removed->id => '2026-10-28 11:00:00'] as $id => $at) {
            DB::table('users')->where('id', $id)->update(['last_seen_at' => $at]);
        }

        $names = fn (string $sort) => collect($this->actingAs($admin)->getJson(adminPath()."users?sort={$sort}")->assertOk()->json('data'))
            ->pluck('name')->all();

        expect($names('-last_seen'))->toBe(['Яна', 'Борис', 'Админ', 'Вера', 'Глеб'])
            ->and($names('last_seen'))->toBe(['Борис', 'Яна', 'Админ', 'Вера', 'Глеб'])
            ->and($names('name'))->toBe(['Админ', 'Борис', 'Вера', 'Глеб', 'Яна']);

        $removedRow = collect($this->actingAs($admin)->getJson(adminPath().'users')->json('data'))->firstWhere('id', $removed->id);
        expect($removedRow['last_seen_at'])->toBeNull();

        $this->actingAs($admin)->getJson(adminPath().'users?sort=email')->assertUnprocessable();
    });
});

it('миграция: начальная «последняя активность» — время последнего входа', function () {
    asSchemaOwner(function () {
        $migration = require database_path('migrations/2026_10_28_200001_add_last_seen_and_email_change_requests.php');
        $migration->down();
        $user = member();
        $never = member();
        DB::table('users')->where('id', $user->id)->update(['last_login_at' => '2026-05-01 10:00:00+00']);

        $migration->up();

        expect(DB::table('users')->where('id', $user->id)->value('last_seen_at'))->toStartWith('2026-05-01 10:00:00')
            ->and(DB::table('users')->where('id', $never->id)->value('last_seen_at'))->toBeNull();
    });
});

describe('«Завершить все сеансы»', function () {
    it('администратор завершает все сеансы участника: другие устройства выходят, событие в журнале компании', function () {
        $admin = admin();
        $user = member(['email' => 'boris@selen.test']);
        $first = browser();
        $second = browser('10.0.0.2');
        $first->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD, 'remember' => true])->assertOk();
        $second->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
        $token = $user->fresh()->remember_token;

        $this->actingAs($admin)->postJson(adminPath()."users/{$user->id}/terminate-sessions")->assertNoContent();

        $first->get('/api/v1/auth/me')->assertUnauthorized();
        $second->get('/api/v1/auth/me')->assertUnauthorized();
        expect($user->fresh()->remember_token)->not->toBe($token)
            ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0);
        $event = EventLogEntry::query()->where('event_type', 'user.sessions_terminated')->sole();
        expect($event->actor_id)->toBe($admin->id)
            ->and($event->subject_id)->toBe($user->id)
            ->and($event->company_id)->toBe(company()->id)
            ->and($event->payload)->toEqual([]);

        // Учётная запись не изменилась: войти снова можно
        $first->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
        expectNoPersonalDataInEventLog();
    });

    it('права — как у деактивации: Владельцем никто, администратором — только Владелец, себя — нет, участник — 403', function () {
        $owner = owner();
        $admin = admin();
        $otherAdmin = admin();
        $user = member();

        $this->actingAs($admin)->postJson(adminPath()."users/{$owner->id}/terminate-sessions")->assertForbidden();
        $this->actingAs($admin)->postJson(adminPath()."users/{$otherAdmin->id}/terminate-sessions")->assertForbidden();
        $this->actingAs($admin)->postJson(adminPath()."users/{$admin->id}/terminate-sessions")->assertForbidden();
        $this->actingAs($owner)->postJson(adminPath()."users/{$owner->id}/terminate-sessions")->assertForbidden();
        $this->actingAs(member())->postJson(adminPath()."users/{$user->id}/terminate-sessions")->assertForbidden();
        $this->actingAs($owner)->postJson(adminPath()."users/{$otherAdmin->id}/terminate-sessions")->assertNoContent();

        // Участник с правом «управлять пользователями» — как администратор
        $granted = member();
        CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $granted->id, 'permission' => Permission::CompanyManageUsers]);
        $this->actingAs($granted)->postJson(adminPath()."users/{$user->id}/terminate-sessions")->assertNoContent();
    });

    it('гостя и убранного из компании (работает в другой) — нельзя: сеансы у учётной записи общие', function () {
        $admin = admin();
        $other = otherCompany();
        $guest = User::factory()->inCompany($other)->guestIn(company())->create();
        $removed = member();
        $removed->companies()->updateExistingPivot(company()->id, ['deactivated_at' => now()]);
        $removed->companies()->attach($other->id, ['kind' => 'home']);

        $this->actingAs($admin)->postJson(adminPath()."users/{$guest->id}/terminate-sessions")->assertForbidden();
        $this->actingAs($admin)->postJson(adminPath()."users/{$removed->id}/terminate-sessions")->assertForbidden();

        $rows = collect($this->actingAs($admin)->getJson(adminPath().'users')->json('data'))->keyBy('id');
        expect($rows[$guest->id]['permissions']['terminate_sessions'])->toBeFalse()
            ->and($rows[$removed->id]['permissions']['terminate_sessions'])->toBeFalse();
    });

    it('сотрудник двух компаний — администратор любой из них (решение PM 28.10, п. 8)', function () {
        $other = otherCompany();
        $user = member();
        $user->companies()->attach($other->id, ['kind' => 'home']);

        $this->actingAs(admin(company: $other))->postJson(adminPath($other)."users/{$user->id}/terminate-sessions")->assertNoContent();
        $this->actingAs(admin())->postJson(adminPath()."users/{$user->id}/terminate-sessions")->assertNoContent();
    });
});
