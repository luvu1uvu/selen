<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardTransition;
use App\Models\EventLogEntry;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/*
| История карточки неизменяема (ADR-0003, ADR-0006, ADR-0011; ADR-0015 этого не меняет): ни удаление в корзину,
| ни один другой путь не удаляет и не переписывает card_transitions, card_blocks и event_log, а саму карточку
| нельзя удалить физически. Проверки — после удаления в корзину, на «чистой» транзакции (савепойнт сохраняет
| транзакцию теста после ошибки).
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->sysadmin = admin();
    addToSpace($this->space, $this->sysadmin, SpaceRole::Admin);
    $board = makeBoard($this->space, $this->sysadmin, BoardTemplate::Simple);
    $this->card = moveCard(makeCard($board, 'To Do', $this->sysadmin), 'In Progress', $this->sysadmin);
    $blocker = makeCard($board, 'To Do', $this->sysadmin);
    makeBlock($this->card, $this->sysadmin, $blocker);
    makeBlock($blocker, $this->sysadmin, $this->card);
    $this->actingAs($this->sysadmin)->deleteJson('/api/v1/cards/DEV-1')->assertNoContent();
    $this->counts = fn () => [
        DB::table('cards')->count(),
        DB::table('card_transitions')->count(),
        DB::table('card_blocks')->count(),
        DB::table('event_log')->count(),
    ];
    $this->before = ($this->counts)();
});

/** Ошибка внутри савепойнта: транзакция теста остаётся рабочей. */
function expectRejected(Closure $attempt, string $exception = QueryException::class): void
{
    expect(fn () => DB::transaction($attempt))->toThrow($exception);
}

it('удаление в корзину ничего не удаляет физически', function () {
    expect(Card::withTrashed()->whereKey($this->card->id)->exists())->toBeTrue()
        ->and(DB::table('card_transitions')->where('card_id', $this->card->id)->count())->toBe(2)
        ->and(DB::table('card_blocks')->count())->toBe(2);
});

it('строки истории нельзя удалить, изменить и очистить SQL-запросом — ни для каких карточек', function (string $table, string $sql) {
    expectRejected(fn () => DB::statement(str_replace('{table}', $table, $sql)));

    expect(($this->counts)())->toBe($this->before);
})->with([
    'переходы: DELETE' => ['card_transitions', 'DELETE FROM {table}'],
    'переходы: UPDATE' => ['card_transitions', "UPDATE {table} SET reason = 'manual'"],
    'переходы: TRUNCATE' => ['card_transitions', 'TRUNCATE {table} CASCADE'],
    'блокировки: DELETE' => ['card_blocks', 'DELETE FROM {table}'],
    'блокировки: TRUNCATE' => ['card_blocks', 'TRUNCATE {table} CASCADE'],
    'блокировки: правка закрытого эпизода' => ['card_blocks', "UPDATE {table} SET reason = 'другая' WHERE ended_at IS NOT NULL"],
    'журнал: DELETE' => ['event_log', 'DELETE FROM {table}'],
    'журнал: UPDATE' => ['event_log', "UPDATE {table} SET payload = '{}'"],
    'журнал: TRUNCATE' => ['event_log', 'TRUNCATE {table} CASCADE'],
]);

it('никакой флаг сеанса не открывает обход триггеров', function () {
    foreach (['selen.card_purge', 'selen.allow_delete'] as $setting) {
        expectRejected(function () use ($setting) {
            DB::select('SELECT set_config(?, ?, true)', [$setting, 'on']);
            DB::table('card_transitions')->delete();
        });
    }

    expect(($this->counts)())->toBe($this->before);
});

it('код приложения не умеет выключать триггеры и удалять историю', function () {
    // Суперпользователь БД обходит любые триггеры (session_replication_role, DISABLE TRIGGER) — поэтому таких
    // приёмов нет ни в одном файле приложения; меняют схему только миграции
    $files = collect(File::allFiles(app_path()))->merge(File::allFiles(base_path('routes')));
    $forbidden = '/session_replication_role|DISABLE\s+TRIGGER|DROP\s+TRIGGER|forbid_append_only_modification|forceDelete\(|DELETE\s+FROM\s+(card_transitions|card_blocks|event_log)/i';

    $offenders = $files->filter(fn ($file) => preg_match($forbidden, $file->getContents()) === 1)
        ->map(fn ($file) => $file->getRelativePathname())->values()->all();

    expect($offenders)->toBe([]);
});

it('карточку нельзя удалить физически: ни моделью, ни SQL', function () {
    $card = Card::withTrashed()->findOrFail($this->card->id);

    expectRejected(fn () => $card->forceDelete(), LogicException::class);
    // Внешние ключи RESTRICT: на карточку ссылаются её переходы
    expectRejected(fn () => DB::table('cards')->where('id', $card->id)->delete());

    expect(($this->counts)())->toBe($this->before);
});

it('модели истории запрещают удаление и правку', function () {
    expectRejected(fn () => CardTransition::query()->withoutGlobalScopes()->firstOrFail()->delete(), LogicException::class);
    expectRejected(fn () => CardTransition::query()->withoutGlobalScopes()->firstOrFail()->forceFill(['reason' => 'manual'])->save(), LogicException::class);
    expectRejected(fn () => CardBlock::query()->firstOrFail()->delete(), LogicException::class);
    expectRejected(fn () => EventLogEntry::query()->firstOrFail()->delete(), LogicException::class);

    expect(($this->counts)())->toBe($this->before);
});

it('восстановление из корзины тоже ничего не переписывает — только добавляет', function () {
    $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore')->assertOk();

    [$cards, $transitions, $blocks, $events] = ($this->counts)();
    expect($cards)->toBe($this->before[0])
        ->and($transitions)->toBeGreaterThanOrEqual($this->before[1])
        ->and($blocks)->toBe($this->before[2])
        ->and($events)->toBeGreaterThan($this->before[3]);
});
