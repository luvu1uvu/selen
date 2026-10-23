<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\EventLogEntry;
use App\Models\Mention;
use App\Models\User;
use App\Support\RichText\RichTextDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/*
| Описание карточки — документ визуального редактора (ADR-0009): белый список узлов и атрибутов,
| ссылки только http/https/mailto, упоминания — только тех, кто видит карточку (поправка PM A).
*/

beforeEach(function () {
    Storage::fake('attachments');
    $this->space = space(['key' => 'DEV']);
    $this->editor = member(['name' => 'Борис Редактор']);
    $this->colleague = member(['name' => 'Вера Коллега']);
    $this->restricted = member(['name' => 'Жанна Подрядчик']);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->colleague, SpaceRole::Commenter);
    addToSpace($this->space, $this->restricted, SpaceRole::Editor);
    restrictToOwnCards($this->restricted);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
    $this->describe = fn (?array $doc) => $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['description' => $doc]);
});

/** @return array<string, mixed> */
function docWith(array $node): array
{
    return ['type' => 'doc', 'content' => [$node]];
}

describe('белый список', function () {
    it('пропускает всё, что умеет редактор', function () {
        $doc = ['type' => 'doc', 'content' => [
            ['type' => 'heading', 'attrs' => ['level' => 2], 'content' => [['type' => 'text', 'text' => 'Заголовок']]],
            ['type' => 'paragraph', 'content' => [
                ['type' => 'text', 'text' => 'жирный', 'marks' => [['type' => 'bold'], ['type' => 'italic']]],
                ['type' => 'hardBreak'],
                ['type' => 'text', 'text' => 'ссылка', 'marks' => [['type' => 'link', 'attrs' => [
                    'href' => 'https://example.com/a?b=1', 'target' => '_blank', 'rel' => 'noopener noreferrer nofollow', 'class' => null,
                ]]]],
                ['type' => 'text', 'text' => 'почта', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'mailto:a@b.ru']]]],
                ['type' => 'text', 'text' => 'код', 'marks' => [['type' => 'code'], ['type' => 'strike']]],
            ]],
            ['type' => 'bulletList', 'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph']]]]],
            ['type' => 'orderedList', 'attrs' => ['start' => 3, 'type' => null], 'content' => [['type' => 'listItem', 'content' => [['type' => 'paragraph']]]]],
            ['type' => 'taskList', 'content' => [['type' => 'taskItem', 'attrs' => ['checked' => true], 'content' => [['type' => 'paragraph']]]]],
            ['type' => 'blockquote', 'content' => [['type' => 'paragraph']]],
            ['type' => 'codeBlock', 'attrs' => ['language' => 'php'], 'content' => [['type' => 'text', 'text' => '<?php echo 1;']]],
            ['type' => 'horizontalRule'],
        ]];

        expect((new RichTextDocument($doc))->errors())->toBe([]);
        ($this->describe)($doc)->assertOk()->assertJsonPath('data.description', fn ($v) => $v == $doc);
    });

    it('отклоняет опасное и незнакомое — 422, ничего не вырезая', function (array $doc) {
        ($this->describe)($doc)->assertUnprocessable()
            ->assertJsonPath('errors.description.0', __('selen.rich_text.invalid'));
    })->with([
        'javascript: в ссылке' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'x', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'javascript:alert(1)']]]]]])],
        'data: в ссылке' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'x', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'data:text/html,<b>']]]]]])],
        'ссылка с пробелом' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'x', 'marks' => [['type' => 'link', 'attrs' => ['href' => "https://a.ru/\njavascript:1"]]]]]])],
        'незнакомый узел' => [docWith(['type' => 'iframe', 'attrs' => ['src' => 'https://evil']])],
        'незнакомый атрибут' => [docWith(['type' => 'paragraph', 'attrs' => ['onclick' => 'x']])],
        'style у ссылки' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'x', 'marks' => [['type' => 'link', 'attrs' => ['href' => 'https://a.ru', 'style' => 'x']]]]]])],
        'картинка по адресу' => [docWith(['type' => 'image', 'attrs' => ['src' => 'https://evil/x.png']])],
        'имя в упоминании' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'mention', 'attrs' => ['id' => '01jtestuser0000000000000000', 'label' => 'Имя']]]])],
        'заголовок h5' => [docWith(['type' => 'heading', 'attrs' => ['level' => 5]])],
        'не документ' => [['type' => 'paragraph']],
        'html в поле' => [['type' => 'doc', 'content' => [['type' => 'paragraph', 'html' => '<script>']]]],
        'пустой текстовый узел' => [docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => '']]])],
    ]);

    it('пробелы внутри документа доходят до сервера как есть (TrimStrings их не трогает)', function () {
        $doc = docWith(['type' => 'paragraph', 'content' => [
            ['type' => 'text', 'text' => 'Проверить с '],
            ['type' => 'mention', 'attrs' => ['id' => $this->colleague->id, 'label' => null, 'mentionSuggestionChar' => '@']],
            ['type' => 'text', 'text' => ' '],
        ]]);

        ($this->describe)($doc)->assertOk()->assertJsonPath('data.description', fn ($v) => $v == $doc);
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/comments', ['body' => $doc])
            ->assertCreated()->assertJsonPath('data.body', fn ($v) => $v == $doc);
        // Название по-прежнему обрезается
        $this->actingAs($this->editor)->patchJson('/api/v1/cards/DEV-1', ['title' => '  Название  '])
            ->assertJsonPath('data.title', 'Название');
    });

    it('ограничивает глубину и размер', function () {
        $deep = ['type' => 'paragraph'];
        for ($i = 0; $i < 25; $i++) {
            $deep = ['type' => 'blockquote', 'content' => [$deep]];
        }
        ($this->describe)(docWith($deep))->assertUnprocessable();

        $huge = docWith(['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => str_repeat('я', 120_000)]]]);
        ($this->describe)($huge)->assertUnprocessable();
    });

    it('пустой документ — это «нет описания»; в журнал — только факт изменения', function () {
        ($this->describe)(richText('Секретный текст описания'))->assertOk();
        ($this->describe)(['type' => 'doc', 'content' => [['type' => 'paragraph']]])->assertOk()->assertJsonPath('data.description', null);

        expect(EventLogEntry::query()->where('event_type', 'card.updated')->pluck('payload')->all())
            ->toEqual([['fields' => ['description']], ['fields' => ['description']]])
            ->and(DB::table('event_log')->pluck('payload')->implode(' '))->not->toContain('Секретный');
    });
});

describe('упоминания', function () {
    it('сохраняются в mentions; имена — из пользователей, в документе только id', function () {
        ($this->describe)(richText('Посмотри, ', ['mention' => $this->colleague->id]))
            ->assertOk()
            ->assertJsonPath('data.mentioned_users', [$this->colleague->id => 'Вера Коллега']);

        expect(Mention::query()->sole())
            ->user_id->toBe($this->colleague->id)
            ->source_type->toBe('card')
            ->source_id->toBe($this->card->id)
            ->mentioned_by->toBe($this->editor->id);

        // Повторное сохранение — та же строка (уведомление этапа 3 не повторится); убрали — строки нет
        $first = Mention::query()->sole()->id;
        ($this->describe)(richText('Ещё раз ', ['mention' => $this->colleague->id]))->assertOk();
        expect(Mention::query()->sole()->id)->toBe($first);
        ($this->describe)(richText('Без упоминаний'))->assertOk();
        expect(Mention::query()->count())->toBe(0);
    });

    it('нельзя упомянуть пользователя с ограничением, который не видит карточку (поправка A)', function () {
        ($this->describe)(richText(['mention' => $this->restricted->id]))
            ->assertUnprocessable()
            ->assertJsonPath('errors.description.0', __('selen.rich_text.mention_not_allowed'));

        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/comments', ['body' => richText(['mention' => $this->restricted->id])])
            ->assertUnprocessable()
            ->assertJsonPath('errors.body.0', __('selen.rich_text.mention_not_allowed'));

        // Его нет и в подсказке @
        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/mentionable')
            ->assertOk()
            ->assertJsonMissing(['id' => $this->restricted->id])
            ->assertJsonFragment(['id' => $this->colleague->id]);
    });

    it('как только он видит карточку — упомянуть можно; подсказка и сервер согласны', function () {
        $this->card->forceFill(['responsible_id' => $this->restricted->id])->save();

        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/mentionable')->assertJsonFragment(['id' => $this->restricted->id]);
        ($this->describe)(richText(['mention' => $this->restricted->id]))->assertOk();
    });

    it('нельзя упомянуть чужого и деактивированного; уже упомянутый не мешает править текст', function () {
        $outsider = member();
        $gone = User::factory()->deactivated()->create();
        addToSpace($this->space, $gone, SpaceRole::Editor);

        foreach ([$outsider, $gone] as $user) {
            ($this->describe)(richText(['mention' => $user->id]))->assertUnprocessable();
        }

        ($this->describe)(richText('Было ', ['mention' => $this->colleague->id]))->assertOk();
        $this->colleague->forceFill(['status' => 'deactivated'])->save();
        ($this->describe)(richText('Стало ', ['mention' => $this->colleague->id]))->assertOk();
    });
});

it('картинка в описании — только вложение-изображение этой карточки', function () {
    $own = makeAttachment($this->card, $this->editor);
    $pdf = makeAttachment($this->card, $this->editor, 'a.pdf', '%PDF', 'application/pdf');
    $foreign = makeAttachment(makeCard($this->board, 'To Do', $this->editor), $this->editor);

    $image = fn (string $id) => docWith(['type' => 'image', 'attrs' => ['attachmentId' => $id, 'alt' => null]]);

    ($this->describe)($image($own->id))->assertOk();
    foreach ([$pdf->id, $foreign->id, (string) Str::ulid()] as $id) {
        ($this->describe)($image($id))->assertUnprocessable()
            ->assertJsonPath('errors.description.0', __('selen.rich_text.image_not_allowed'));
    }
});
