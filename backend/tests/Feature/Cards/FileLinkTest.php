<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\SpaceMember;
use App\Models\User;
use App\Services\Attachments\AttachmentFiles;
use Database\Factories\UserFactory;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\Support\Browser;

/*
| Ссылка на файл, открытая напрямую (UI-1b, LATER-51): веб-маршрут /files/{id} на сессии. Браузер открывает его сам —
| без Referer, Origin и X-Selen-User (Browser::navigate). Права — при каждом открытии, как у файла в приложении.
*/

beforeEach(function () {
    Storage::fake('attachments');
    $this->space = space(['key' => 'DEV']);
    $this->editor = member();
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
    $this->image = makeAttachment($this->card, $this->editor, 'скриншот.png', PNG_1X1, 'image/png');
});

/** Вошедший через форму (cookie сессии) пользователь в браузере. */
function signedIn(User $user): Browser
{
    $browser = browser();
    $browser->post('/api/v1/auth/login', ['email' => $user->email, 'password' => UserFactory::PASSWORD])->assertOk();

    return $browser;
}

it('вошедший с доступом открывает ссылку напрямую — файл; /api/v1 без признаков SPA по-прежнему 401', function () {
    $browser = signedIn($this->editor);

    $response = $browser->navigate("/files/{$this->image->id}")->assertOk();
    expect($response->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments/'.$this->image->path)
        ->and($response->headers->get('Content-Type'))->toBe('image/png')
        ->and($response->headers->get('Content-Disposition'))->toStartWith('inline;')
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->headers->get('Content-Security-Policy'))->toBe("default-src 'none'; sandbox");

    // Защита API не ослаблена: тот же файл через /api/v1 без Referer/Origin — 401, как раньше
    $browser->navigate("/api/v1/attachments/{$this->image->id}")->assertUnauthorized();
    // «Скачать» — всегда скачиванием
    expect($browser->navigate("/files/{$this->image->id}?download=1")->headers->get('Content-Disposition'))
        ->toStartWith('attachment;');
});

it('без входа — страница входа с адресом файла для возврата (и с ?download=1)', function () {
    browser()->navigate("/files/{$this->image->id}")
        ->assertRedirect('/login?next='.rawurlencode("/files/{$this->image->id}"));
    browser()->navigate("/files/{$this->image->id}?download=1")
        ->assertRedirect('/login?next='.rawurlencode("/files/{$this->image->id}?download=1"));
});

it('нет доступа, «только свои», корзина, удалённое вложение, нет такого — одинаковый 404 без названий', function () {
    $outsider = member();
    $restricted = member();
    addToSpace($this->space, $restricted, SpaceRole::Editor);
    SpaceMember::query()->where('user_id', $restricted->id)->update(['own_cards_only' => true]);
    $removed = makeAttachment($this->card, $this->editor, 'удалённый.png', PNG_1X1, 'image/png');
    $removed->forceFill(['deleted_at' => now(), 'deleted_by' => $this->editor->id])->save();
    $trashedCard = makeCard($this->board, 'To Do', $this->editor, 'В корзине');
    $inTrash = makeAttachment($trashedCard, $this->editor, 'в-корзине.png', PNG_1X1, 'image/png');
    $trashedCard->forceFill(['deleted_at' => now(), 'deleted_by' => admin()->id])->save();

    $missing = signedIn($this->editor)->navigate('/files/01ja0000000000000000000000')->assertNotFound();
    $cases = [
        'не участник' => [$outsider, $this->image],
        'только свои — чужая карточка' => [$restricted, $this->image],
        'вложение удалено' => [$this->editor, $removed],
        'карточка в корзине' => [$this->editor, $inTrash],
    ];
    foreach ($cases as $case => [$user, $attachment]) {
        $response = signedIn($user)->navigate("/files/{$attachment->id}")->assertNotFound();
        expect($response->getContent(), $case)->toBe($missing->getContent())
            ->not->toContain($attachment->name)
            ->not->toContain($this->card->title);
    }

    // Своя карточка у пользователя с ограничением — открывается
    $this->card->forceFill(['responsible_id' => $restricted->id])->save();
    signedIn($restricted)->navigate("/files/{$this->image->id}")->assertOk();
});

it('PDF по содержимому — в браузере, со своей CSP без sandbox; «.pdf» по имени, а внутри HTML — только скачивание', function () {
    $pdf = makeAttachment($this->card, $this->editor, 'договор.pdf', "%PDF-1.4\n%âãÏÓ\n", AttachmentFiles::PDF);
    $fake = makeAttachment($this->card, $this->editor, 'отчёт.pdf', '<html><script>alert(1)</script></html>', 'text/html');
    $svg = makeAttachment($this->card, $this->editor, 'logo.svg', '<svg onload="alert(1)"/>', 'image/svg+xml');
    $browser = signedIn($this->editor);

    $response = $browser->navigate("/files/{$pdf->id}")->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('application/pdf')
        ->and($response->headers->get('Content-Disposition'))->toStartWith('inline;')
        ->and($response->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments-pdf/'.$pdf->path)
        ->and($response->headers->get('Content-Security-Policy'))->toBe(AttachmentFiles::PDF_CSP)
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');

    $download = $browser->navigate("/files/{$pdf->id}?download=1");
    expect($download->headers->get('Content-Type'))->toBe('application/octet-stream')
        ->and($download->headers->get('Content-Disposition'))->toStartWith('attachment;')
        ->and($download->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments/'.$pdf->path);

    foreach ([$fake, $svg] as $file) {
        $response = $browser->navigate("/files/{$file->id}");
        expect($response->headers->get('Content-Type'), $file->name)->toBe('application/octet-stream')
            ->and($response->headers->get('Content-Disposition'))->toStartWith('attachment;')
            ->and($response->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments/'.$file->path);
    }

    // Приложение (/api/v1) PDF по-прежнему не показывает — только скачивание
    expect($this->actingAs($this->editor)->get("/api/v1/attachments/{$pdf->id}?inline=1")->headers->get('Content-Disposition'))
        ->toStartWith('attachment;');
});

it('деактивированный с уцелевшей сессией — как без входа: страница входа, сессия завершена', function () {
    $browser = signedIn($this->editor);
    // Деактивация удаляет сессии; здесь — «уцелевшая», как в ADR-0002 («второй рубеж»)
    User::query()->whereKey($this->editor->id)->update(['status' => UserStatus::Deactivated->value]);

    $browser->navigate("/files/{$this->image->id}")
        ->assertRedirect('/login?next='.rawurlencode("/files/{$this->image->id}"));
    $browser->get('/api/v1/auth/me')->assertUnauthorized();
});

it('веб-маршрут один — ссылка на файл; без проверки пользователя вкладки и с лимитом запросов', function () {
    $web = collect(Route::getRoutes()->getRoutes())
        ->reject(fn ($route) => str_starts_with($route->uri(), 'api/'))
        ->map(fn ($route) => $route->getName() ?? $route->uri())
        ->values()->all();
    // Служебные: CSRF-cookie Sanctum, health check, локальный диск Laravel (подписанные ссылки, диск local)
    expect($web)->toEqualCanonicalizing(['files.show', 'sanctum.csrf-cookie', 'up', 'storage.local', 'storage.local.upload']);

    $route = Route::getRoutes()->getByName('files.show');
    expect($route->gatherMiddleware())->toContain('web', 'auth', 'active', 'throttle:files')
        ->not->toContain('tab-user');
});
