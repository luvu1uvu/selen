<?php

use App\Enums\Theme;
use Database\Factories\UserFactory;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
| Тема оформления (ADR-0025): «Светлая / Тёмная / Как в системе» в меню пользователя, по умолчанию светлая (решение PM
| 21.10, LATER-89, п. 8). Хранится в настройках пользователя на сервере и приходит в /auth/me; в журнал событий смена
| темы не пишется (решение PM 26.10).
*/

it('по умолчанию у пользователя светлая тема — она приходит в /auth/me', function () {
    $this->actingAs(member())->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.theme', 'light');
});

it('сохраняет выбранную тему и отдаёт её в /auth/me', function (string $theme) {
    $user = member();

    $this->actingAs($user)->putJson('/api/v1/profile/theme', ['theme' => $theme])
        ->assertOk()
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.theme', $theme);

    expect($user->fresh()->theme)->toBe(Theme::from($theme));
    $this->getJson('/api/v1/auth/me')->assertJsonPath('data.theme', $theme);
})->with(['dark', 'system', 'light']);

it('смену темы в журнал событий не пишет', function () {
    $this->actingAs(member())->putJson('/api/v1/profile/theme', ['theme' => 'dark'])->assertOk();

    expect(loggedEventTypes())->toBe([]);
});

it('меняет тему только себе: другие поля и чужие настройки не трогает', function () {
    $user = member(['name' => 'Борис']);
    $other = member();

    $this->actingAs($user)->putJson('/api/v1/profile/theme', [
        'theme' => 'dark', 'name' => 'Взлом', 'user_id' => $other->id, 'role' => 'admin',
    ])->assertOk();

    expect($user->fresh())->name->toBe('Борис')->theme->toBe(Theme::Dark)
        ->and($other->fresh()->theme)->toBe(Theme::Light);
});

it('отклоняет пустую и неизвестную тему', function (mixed $theme) {
    $this->actingAs(member())->putJson('/api/v1/profile/theme', ['theme' => $theme])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('theme');
})->with([null, '', 'blue', 'DARK']);

it('гостю — 401', function () {
    $this->putJson('/api/v1/profile/theme', ['theme' => 'dark'])->assertUnauthorized();
});

it('вкладка другого пользователя — 409, тема не меняется', function () {
    member(['email' => 'boris@selen.test']);
    $vera = member();
    $session = browser();
    $session->post('/api/v1/auth/login', ['email' => 'boris@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
    $session->withHeader('X-Selen-User', $vera->id);

    $session->put('/api/v1/profile/theme', ['theme' => 'dark'])->assertStatus(409);

    expect(DB::table('users')->where('theme', 'dark')->count())->toBe(0);
});

it('база не принимает тему вне списка', function () {
    $user = member();

    expect(fn () => DB::table('users')->where('id', $user->id)->update(['theme' => 'blue']))
        ->toThrow(QueryException::class);
});
