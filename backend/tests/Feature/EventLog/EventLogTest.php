<?php

use App\Enums\EventType;
use App\Models\EventLogEntry;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

function recordSomeEvent(): EventLogEntry
{
    return app(EventRecorder::class)->record(EventType::UserCreated, null, member(), ['source' => 'test']);
}

it('записывает событие со временем в UTC с микросекундами', function () {
    $entry = recordSomeEvent()->fresh();

    expect($entry->occurred_at->utcOffset())->toBe(0)
        ->and($entry->subject_type)->toBe('user')
        ->and($entry->payload)->toBe(['source' => 'test']);

    $raw = DB::selectOne('SELECT occurred_at::text AS value FROM event_log WHERE id = ?', [$entry->id])->value;
    expect($raw)->toMatch('/\.\d{1,6}\+00$/');
});

it('запрещает изменять записи через модель', function () {
    $entry = recordSomeEvent();
    $entry->event_type = 'tampered';

    expect(fn () => $entry->save())->toThrow(LogicException::class);
});

it('запрещает удалять записи через модель', function () {
    expect(fn () => recordSomeEvent()->delete())->toThrow(LogicException::class);
});

// Роли приложения UPDATE, DELETE и TRUNCATE не даны вовсе (Database/DatabaseRolesTest); триггер — второй рубеж:
// проверяем его под владельцем схемы, у которого права есть
it('запрещает UPDATE на уровне базы данных', function () {
    expect(fn () => asOwner("UPDATE event_log SET event_type = 'tampered'"))->toThrow(QueryException::class, 'append-only');
});

it('запрещает DELETE на уровне базы данных', function () {
    expect(fn () => asOwner('DELETE FROM event_log'))->toThrow(QueryException::class, 'append-only');
});

it('запрещает TRUNCATE на уровне базы данных', function () {
    // CASCADE снимает препятствие внешнего ключа из auth_audit — остаётся только триггер
    expect(fn () => asOwner('TRUNCATE event_log CASCADE'))->toThrow(QueryException::class, 'append-only');
});

it('показывает журнал администратору с фильтром по типу', function () {
    $admin = admin();
    recordSomeEvent();
    app(EventRecorder::class)->record(EventType::Logout, $admin, $admin);

    $this->actingAs($admin)->getJson(adminPath().'events')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.event_type', 'auth.logout')
        ->assertJsonPath('data.0.actor.name', $admin->name)
        ->assertJsonPath('data.1.actor', null);

    $this->actingAs($admin)->getJson(adminPath().'events?event_type=user.created')
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.payload.source', 'test');

    $this->actingAs($admin)->getJson(adminPath().'events?event_type=unknown.type')->assertUnprocessable();
});

it('при откате транзакции событие тоже не сохраняется', function () {
    try {
        DB::transaction(function () {
            recordSomeEvent();
            throw new RuntimeException('domain failure');
        });
    } catch (RuntimeException) {
    }

    expect(EventLogEntry::query()->count())->toBe(0);
});

it('фильтр по человеку: что он сделал и что сделали с ним (П2c-2)', function () {
    $admin = admin();
    $boris = member();
    $vera = member();
    $recorder = app(EventRecorder::class);
    $recorder->record(EventType::Logout, $boris, $boris);
    $recorder->record(EventType::UserRoleChanged, $admin, $boris, ['from' => 'member', 'to' => 'admin'], company: company());
    $recorder->record(EventType::Logout, $vera, $vera);
    $recorder->record(EventType::GroupCreated, $boris, makeGroup());

    $types = fn (string $query) => collect($this->actingAs($admin)->getJson(adminPath()."events?{$query}")->assertOk()->json('data'))
        ->pluck('event_type')->all();

    expect($types("user_id={$boris->id}"))->toBe(['group.created', 'user.role_changed', 'auth.logout'])
        ->and($types("user_id={$boris->id}&event_type=auth.logout"))->toBe(['auth.logout'])
        ->and($types("user_id={$vera->id}"))->toBe(['auth.logout'])
        ->and($types('user_id=nobody'))->toBe([]);
});

it('люди для фильтра журнала — люди компании, только имена; другой компании и без права «журнал» — нет', function () {
    $admin = admin(['name' => 'Анна']);
    member(['name' => 'Борис', 'email' => 'boris@selen.test']);
    $other = otherCompany();
    member(['name' => 'Чужой'], $other);

    $this->actingAs($admin)->getJson(adminPath().'events/people')->assertOk()
        ->assertExactJson(['data' => collect(['Анна', 'Борис'])->map(fn ($name) => ['id' => User::query()->where('name', $name)->value('id'), 'name' => $name])->all()]);

    $this->actingAs(member())->getJson(adminPath().'events/people')->assertForbidden();
    $this->actingAs(admin(company: $other))->getJson(adminPath().'events/people')->assertNotFound();
});
