<?php

use App\Enums\EventType;
use App\Enums\Permission;
use App\Models\AuthAuditEntry;
use App\Models\CompanyPermissionGrant;
use App\Services\EventLog\EventRecorder;
use Database\Factories\UserFactory;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;

it('пишет IP только для событий входа', function () {
    $user = member();
    $recorder = app(EventRecorder::class);

    $recorder->record(EventType::Logout, $user, $user);
    $recorder->record(EventType::UserDeactivated, admin(), $user);

    expect(AuthAuditEntry::query()->pluck('event_type')->all())->toBe(['auth.logout']);
});

it('удаляет записи старше срока хранения, журнал не трогает', function () {
    $user = member();
    $recorder = app(EventRecorder::class);

    $this->travelTo(now()->subMonths(12)->subDay());
    $recorder->record(EventType::Logout, $user, $user);
    $this->travelBack();
    $recorder->record(EventType::Logout, $user, $user);

    Artisan::call('model:prune', ['--model' => [AuthAuditEntry::class]]);

    expect(AuthAuditEntry::query()->count())->toBe(1)
        ->and(loggedEventTypes())->toBe(['auth.logout', 'auth.logout']);
});

it('очистка auth_audit запланирована', function () {
    $commands = collect(app(Schedule::class)->events())->pluck('command')->implode("\n");

    expect($commands)->toContain('model:prune')->toContain('AuthAuditEntry');
});

it('показывает IP события входа в журнале администратора', function () {
    $admin = admin();
    app(EventRecorder::class)->record(EventType::Logout, $admin, $admin);

    $this->actingAs($admin)->getJson(adminPath().'events')
        ->assertOk()
        ->assertJsonPath('data.0.auth_audit.ip', '127.0.0.1')
        ->assertJsonPath('data.0.meta', ['source' => 'http']);
});

it('IP и браузер входа, неудачного входа и выхода — в журнале у того, кому выдано право «журнал» (решение PM 28.10)', function () {
    member(['email' => 'boris@selen.test']);
    $session = browser('10.0.0.7')->withHeader('User-Agent', 'Mozilla/5.0 (Macintosh) Chrome/131.0.0.0 Safari/537.36');
    $session->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => 'неверный пароль 1'])->assertUnprocessable();
    $session->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
    $session->post('/api/v1/auth/logout')->assertNoContent();
    $journal = member();
    CompanyPermissionGrant::query()->forceCreate(['company_id' => company()->id, 'user_id' => $journal->id, 'permission' => Permission::CompanyViewEventLog]);

    $rows = collect($this->actingAs($journal)->getJson(adminPath().'events')->assertOk()->json('data'))->keyBy('event_type');

    foreach (['auth.login_failed', 'auth.login_succeeded', 'auth.logout'] as $type) {
        expect($rows[$type]['auth_audit'])->toBe(['ip' => '10.0.0.7', 'user_agent' => 'Mozilla/5.0 (Macintosh) Chrome/131.0.0.0 Safari/537.36']);
    }
    expect(config('selen.auth_audit.retention_months'))->toBe(12);
});
