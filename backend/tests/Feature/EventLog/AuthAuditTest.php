<?php

use App\Enums\EventType;
use App\Models\AuthAuditEntry;
use App\Services\EventLog\EventRecorder;
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

    $this->actingAs($admin)->getJson('/api/v1/admin/events')
        ->assertOk()
        ->assertJsonPath('data.0.auth_audit.ip', '127.0.0.1')
        ->assertJsonPath('data.0.meta', ['source' => 'http']);
});
