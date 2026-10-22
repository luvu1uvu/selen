<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Attachment;
use App\Models\EventLogEntry;
use App\Models\SpaceMember;
use App\Services\Attachments\AttachmentFiles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Storage;

/*
| Вложения (docs/adr/0010-attachments.md): тип по содержимому, отдача через X-Accel-Redirect,
| активные форматы — только скачиванием, доступ — через карточку (ADR-0008).
*/

beforeEach(function () {
    Storage::fake('attachments');
    $this->space = space(['key' => 'DEV']);
    $this->editor = member();
    $this->commenter = member();
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->commenter, SpaceRole::Commenter);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
    $this->upload = fn ($user, UploadedFile $file, string $card = 'DEV-1') => $this->actingAs($user)
        ->post("/api/v1/cards/{$card}/attachments", ['file' => $file], ['Accept' => 'application/json']);
});

it('загружает файл: тип по содержимому, а не по имени; путь без исходного имени', function () {
    // Картинка под видом документа — всё равно картинка
    ($this->upload)($this->commenter, uploadedFile('отчёт.docx', PNG_1X1))
        ->assertCreated()
        ->assertJsonPath('data.kind', 'image')
        ->assertJsonPath('data.mime', 'image/png')
        ->assertJsonPath('data.name', 'отчёт.docx')
        ->assertJsonPath('data.url', fn ($url) => str_starts_with($url, '/files/'));

    $attachment = Attachment::query()->sole();
    expect($attachment->path)->toStartWith($this->card->id.'/')->not->toContain('отчёт')
        ->and(Storage::disk('attachments')->get($attachment->path))->toBe(PNG_1X1)
        ->and(EventLogEntry::query()->where('event_type', 'card.attachment_added')->sole()->payload)
        ->toEqual(['attachment_id' => $attachment->id, 'kind' => 'image']);

    // HTML под видом картинки — обычный файл
    ($this->upload)($this->editor, uploadedFile('photo.png', '<html><script>alert(1)</script></html>'))
        ->assertCreated()->assertJsonPath('data.kind', 'file')->assertJsonPath('data.mime', null);
});

it('файл и каталог читаемы для nginx (X-Accel-Redirect под другим пользователем)', function () {
    // Storage::fake берёт из конфигурации диска только throw — передаём её целиком
    $disk = Storage::fake('attachments', config('filesystems.disks.attachments'));

    ($this->upload)($this->editor, uploadedFile('скриншот.png', PNG_1X1))->assertCreated();

    $path = Attachment::query()->sole()->path;
    expect(fileperms($disk->path($path)) & 0777)->toBe(0644)
        ->and(fileperms($disk->path(dirname($path))) & 0777)->toBe(0755);
});

it('видео с Mac (.mov) — встроенный плеер: kind video и inline с video/quicktime', function () {
    ($this->upload)($this->editor, uploadedFile('Запись экрана 2026-10-13.mov', MOV_HEADER))
        ->assertCreated()
        ->assertJsonPath('data.kind', 'video')
        ->assertJsonPath('data.mime', 'video/quicktime');

    $video = Attachment::query()->sole();
    $response = $this->actingAs($this->commenter)->get("/api/v1/attachments/{$video->id}?inline=1")->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('video/quicktime')
        ->and($response->headers->get('Content-Disposition'))->toStartWith('inline;')
        ->and($response->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments/'.$video->path)
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');

    // Без inline — обычное скачивание (кнопка «Скачать» в фолбэке плеера)
    expect($this->actingAs($this->commenter)->get("/api/v1/attachments/{$video->id}")->headers->get('Content-Disposition'))
        ->toStartWith('attachment;')->toContain('.mov');
});

it('санитизирует имя файла', function (string $original, string $expected) {
    expect(AttachmentFiles::sanitizeName($original))->toBe($expected);
})->with([
    'путь' => ['../../etc/passwd', 'passwd'],
    'путь Windows' => ['C:\\Users\\a\\план.xlsx', 'план.xlsx'],
    'управляющие символы и кавычки' => ["счёт\u{0000}\u{202E}\"2026\".pdf", 'счёт2026.pdf'],
    'точки и пробелы по краям' => ['  .скрытый.  ', 'скрытый'],
    'пустое' => ['...', 'file'],
    'длинное с расширением' => [str_repeat('я', 200).'.pdf', str_repeat('я', 125).'.pdf'],
]);

it('лимит 100 МБ', function () {
    ($this->upload)($this->editor, UploadedFile::fake()->create('big.zip', 102401))
        ->assertUnprocessable()->assertJsonValidationErrors('file');
});

it('отдаёт через X-Accel-Redirect; inline — только картинки и видео', function () {
    $image = makeAttachment($this->card, $this->editor, 'Скриншот 1.png', PNG_1X1, 'image/png');

    $response = $this->actingAs($this->commenter)->get("/api/v1/attachments/{$image->id}?inline=1")->assertOk();
    expect($response->headers->get('X-Accel-Redirect'))->toBe('/_protected/attachments/'.$image->path)
        ->and($response->headers->get('Content-Type'))->toBe('image/png')
        ->and($response->headers->get('Content-Disposition'))->toStartWith('inline;')
        ->toContain("filename*=utf-8''%D0%A1%D0%BA%D1%80%D0%B8%D0%BD%D1%88%D0%BE%D1%82%201.png")
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->headers->get('Content-Security-Policy'))->toBe("default-src 'none'; sandbox")
        ->and($response->getContent())->toBe('');

    // Без inline — скачивание
    expect($this->actingAs($this->commenter)->get("/api/v1/attachments/{$image->id}")->headers->get('Content-Disposition'))
        ->toStartWith('attachment;');
});

it('SVG, HTML и прочие активные форматы — только скачиванием и как octet-stream', function (string $name, string $mime) {
    $file = makeAttachment($this->card, $this->editor, $name, '<svg onload="alert(1)"/>', $mime);

    $response = $this->actingAs($this->editor)->get("/api/v1/attachments/{$file->id}?inline=1")->assertOk();
    expect($response->headers->get('Content-Type'))->toBe('application/octet-stream')
        ->and($response->headers->get('Content-Disposition'))->toStartWith('attachment;')
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');
})->with([
    ['logo.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['data.xml', 'text/xml'],
    ['doc.pdf', 'application/pdf'],
]);

it('S3: временная ссылка с заголовками скачивания', function () {
    config(['filesystems.disks.attachments.driver' => 's3']);
    Storage::disk('attachments')->buildTemporaryUrlsUsing(
        fn (string $path, $expiration, array $options) => 'https://s3.local/'.$path.'?'.http_build_query($options),
    );
    $file = makeAttachment($this->card, $this->editor, 'page.html', '<html>', 'text/html');

    $location = $this->actingAs($this->editor)->get("/api/v1/attachments/{$file->id}?inline=1")
        ->assertRedirect()->headers->get('Location');

    expect(urldecode($location))->toStartWith('https://s3.local/'.$file->path)
        ->toContain('ResponseContentType=application/octet-stream')
        ->toContain('ResponseContentDisposition=attachment;');
});

describe('доступ', function () {
    it('не участник и пользователь с ограничением без доступа к карточке получают 404', function () {
        $file = makeAttachment($this->card, $this->editor);
        $outsider = member();
        $restricted = member();
        addToSpace($this->space, $restricted, SpaceRole::Editor);
        SpaceMember::query()->where('user_id', $restricted->id)->update(['own_cards_only' => true]);

        foreach ([$outsider, $restricted] as $user) {
            $this->actingAs($user)->get("/api/v1/attachments/{$file->id}", ['Accept' => 'application/json'])->assertNotFound();
            ($this->upload)($user, uploadedFile('a.png', PNG_1X1))->assertNotFound();
        }

        // Своя карточка — доступна
        $this->card->forceFill(['responsible_id' => $restricted->id])->save();
        $this->actingAs($restricted)->get("/api/v1/attachments/{$file->id}")->assertOk();
    });

    it('удаляет загрузивший, editor и admin; commenter — только своё', function () {
        $byEditor = makeAttachment($this->card, $this->editor);
        $byCommenter = makeAttachment($this->card, $this->commenter);

        $this->actingAs($this->commenter)->deleteJson("/api/v1/attachments/{$byEditor->id}")->assertForbidden();
        $this->actingAs($this->commenter)->deleteJson("/api/v1/attachments/{$byCommenter->id}")->assertOk()
            ->assertJsonCount(1, 'data.attachments');
        $this->actingAs($this->editor)->deleteJson("/api/v1/attachments/{$byEditor->id}")->assertOk()
            ->assertJsonPath('data.attachments', []);

        // Удалённое не отдаётся и не удаляется повторно; файл пока на диске (бэкап согласован)
        $this->actingAs($this->editor)->get("/api/v1/attachments/{$byEditor->id}", ['Accept' => 'application/json'])->assertNotFound();
        expect(Storage::disk('attachments')->exists($byEditor->path))->toBeTrue()
            ->and(EventLogEntry::query()->where('event_type', 'card.attachment_removed')->count())->toBe(2);
    });
});

it('файл удалённого вложения стирается через 30 дней, строка остаётся', function () {
    $old = makeAttachment($this->card, $this->editor);
    $recent = makeAttachment($this->card, $this->editor);
    $old->forceFill(['deleted_at' => Date::now()->subDays(31), 'deleted_by' => $this->editor->id])->save();
    $recent->forceFill(['deleted_at' => Date::now()->subDays(5), 'deleted_by' => $this->editor->id])->save();
    $oldPath = $old->path;

    $this->artisan('model:prune', ['--model' => [Attachment::class]])->assertSuccessful();

    expect(Storage::disk('attachments')->exists($oldPath))->toBeFalse()
        ->and(Storage::disk('attachments')->exists($recent->path))->toBeTrue()
        ->and($old->fresh()->path)->toBe('')
        ->and(Attachment::query()->count())->toBe(2);
});

it('счётчики файлов и комментариев — на фасаде доски', function () {
    makeAttachment($this->card, $this->editor);
    makeAttachment($this->card, $this->editor)->forceFill(['deleted_at' => now()])->save();
    makeComment($this->card, $this->editor);
    makeComment($this->card, $this->editor)->forceFill(['deleted_at' => now(), 'body' => null])->save();

    $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")
        ->assertJsonPath('data.cards.0.attachments_count', 1)
        ->assertJsonPath('data.cards.0.comments_count', 1)
        ->assertJsonPath('data.cards.0.checklist', null);
});
