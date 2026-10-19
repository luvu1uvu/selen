<?php

use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Http\Middleware\EnsureSessionUserMatches;
use App\Models\Card;
use App\Models\Comment;
use App\Models\EventLogEntry;
use App\Models\Invitation;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\Route;

/*
| Пользователь вкладки и сессия браузера (ADR-0002, «Изменения»; LATER-57). Вкладка SPA шлёт X-Selen-User — id
| своего пользователя. Cookie сессии общие для вкладок: если сессия уже другого пользователя (в соседней вкладке
| вошли под ним), запрос не выполняется — 409 session_changed, ни данных, ни изменений от чужого имени.
*/

function loggedIn(string $email, string $ip = '10.0.0.1')
{
    $session = browser($ip);
    $session->post('/api/v1/auth/login', ['email' => $email, 'password' => UserFactory::PASSWORD])->assertOk();

    return $session;
}

beforeEach(function () {
    $this->admin = admin(['email' => 'admin@selen.test', 'name' => 'Анна']);
    $this->owner = owner(['email' => 'owner@selen.test', 'name' => 'Ольга']);
});

it('запрос от имени пользователя сессии и запрос без заголовка — выполняются', function () {
    $session = loggedIn('owner@selen.test');

    $session->get('/api/v1/navigation')->assertOk();
    $session->withHeader('X-Selen-User', $this->owner->id)->get('/api/v1/navigation')->assertOk();
    $session->patch('/api/v1/profile', ['name' => 'Ольга В.', 'timezone' => 'Europe/Moscow'])->assertOk();

    expect($this->owner->fresh()->name)->toBe('Ольга В.');
});

it('вкладка работает от имени другого пользователя — 409, ничего не выполнено и не отдано', function () {
    // Сессия браузера — Владельца (вошли в соседней вкладке), а вкладка всё ещё считает себя администратором
    $session = loggedIn('owner@selen.test')->withHeader('X-Selen-User', $this->admin->id);
    $events = EventLogEntry::query()->count();

    $session->patch('/api/v1/profile', ['name' => 'Чужое имя', 'timezone' => 'Europe/Moscow'])
        ->assertStatus(409)
        ->assertExactJson(['message' => __('selen.session_changed'), 'code' => 'session_changed']);
    $session->get('/api/v1/navigation')->assertStatus(409)->assertJsonMissingPath('data');
    $session->post("/api/v1/admin/users/{$this->admin->id}/transfer-ownership", ['password' => UserFactory::PASSWORD])
        ->assertStatus(409);

    expect($this->owner->fresh())->name->toBe('Ольга')->isOwner()->toBeTrue()
        ->and(EventLogEntry::query()->count())->toBe($events);
});

it('сверка — до лимитов: запросы чужой вкладки не тратят попытки ввода пароля', function () {
    $session = loggedIn('owner@selen.test');
    $stale = (clone $session)->withHeader('X-Selen-User', $this->admin->id);
    $target = member();

    foreach (range(1, 8) as $i) {
        $stale->post("/api/v1/admin/users/{$target->id}/transfer-ownership", ['password' => 'wrong'])->assertStatus(409);
    }

    // Лимит смены пароля (6 в минуту) не израсходован: свой запрос проходит до проверки пароля
    $session->post("/api/v1/admin/users/{$target->id}/transfer-ownership", ['password' => 'wrong'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');
});

it('гость с заголовком (сессия закончилась) — как обычно: 401 на защищённом маршруте, вход работает', function () {
    $guest = browser()->withHeader('X-Selen-User', $this->admin->id);

    $guest->get('/api/v1/navigation')->assertUnauthorized();
    $guest->post('/api/v1/auth/login', ['email' => 'admin@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
});

it('принятие приглашения во вкладке, где вошёл другой, выполняется и меняет пользователя сессии', function () {
    Invitation::factory()->withToken('invite-token')->create();
    // Вкладка Анны (её сессия), по ссылке задают пароль новому сотруднику
    $session = loggedIn('admin@selen.test')->withHeader('X-Selen-User', $this->admin->id);

    $accepted = $session->post('/api/v1/invitations/invite-token/accept', [
        'password' => 'my-new-password', 'password_confirmation' => 'my-new-password',
    ])->assertOk()->json('data');

    browser()->get('/api/v1/auth/me')->assertUnauthorized();   // другой браузер — гость
    expect($accepted['id'])->not->toBe($this->admin->id);
});

it('деактивированный с уцелевшей сессией получает 401 и на существующее, и на несуществующее пространство', function () {
    $user = member(['email' => 'gone@selen.test']);
    addToSpace(space(['key' => 'DEV']), $user, SpaceRole::Editor);
    $first = loggedIn('gone@selen.test', '10.0.0.2');
    $second = loggedIn('gone@selen.test', '10.0.0.3');
    // Сессии не удалены — «второй рубеж» (ADR-0002, п. 4)
    $user->forceFill(['status' => UserStatus::Deactivated])->save();

    // Проверка активности — до привязки моделей: по ответу не отличить существующий ключ от несуществующего
    $first->get('/api/v1/spaces/DEV')->assertUnauthorized();
    $second->get('/api/v1/spaces/NOPE')->assertUnauthorized();
});

it('запрос с сессией без заголовка (вкладка со старым кодом) — 409, комментарий не создан (LATER-57)', function () {
    $space = space(['key' => 'DEV']);
    addToSpace($space, $this->owner, SpaceRole::Admin);
    $card = makeCard(makeBoard($space, $this->owner), 'To Do', $this->owner);
    $session = loggedIn('owner@selen.test')->withoutTabUser();

    $session->post("/api/v1/cards/{$card->key()}/comments", ['body' => richText('Без заголовка')])
        ->assertStatus(409)
        ->assertExactJson(['message' => __('selen.session_unverified'), 'code' => 'session_unverified']);
    $session->patch("/api/v1/cards/{$card->key()}", ['title' => 'Чужое название'])->assertStatus(409);

    expect(Comment::query()->count())->toBe(0)
        ->and(Card::query()->find($card->id)->title)->toBe('Карточка');
});

it('без заголовка работают вход, выход, /auth/me, восстановление пароля и приглашение', function () {
    Invitation::factory()->withToken('invite-token')->create();
    $session = loggedIn('admin@selen.test')->withoutTabUser();

    $session->get('/api/v1/auth/me')->assertOk();
    $session->get('/api/v1/invitations/invite-token')->assertOk();
    $session->post('/api/v1/auth/forgot-password', ['email' => 'admin@selen.test'])->assertOk();
    $session->post('/api/v1/invitations/invite-token/accept', [
        'password' => 'my-new-password', 'password_confirmation' => 'my-new-password',
    ])->assertOk();
    $session->post('/api/v1/auth/logout')->assertNoContent();
    $session->post('/api/v1/auth/login', ['email' => 'owner@selen.test', 'password' => UserFactory::PASSWORD])->assertOk();
});

it('каждый маршрут вошедших сверяет пользователя вкладки (кроме /auth/me, выхода и файла вложения), публичные — нет', function () {
    $router = app('router');
    $checked = fn ($route) => in_array(EnsureSessionUserMatches::class, $router->gatherRouteMiddleware($route), true);

    $routes = collect(Route::getRoutes()->getRoutes())->filter(fn ($route) => str_starts_with($route->uri(), 'api/v1/'));
    $isAuthenticated = fn ($route) => in_array('auth:sanctum', $route->gatherMiddleware(), true);
    $authenticated = $routes->filter($isAuthenticated);
    expect($authenticated->count())->toBeGreaterThan(100);

    foreach ($authenticated as $route) {
        // Файл вложения грузит сам браузер (<img>, <video>, «скачать») — без заголовков
        $exempt = in_array($route->getName(), ['auth.me', 'auth.logout', 'attachments.show'], true);
        expect($checked($route))->toBe(! $exempt, $route->uri().' '.implode('|', $route->methods()));
    }
    foreach ($routes->reject($isAuthenticated) as $route) {
        expect($checked($route))->toBeFalse($route->uri());
    }
});
