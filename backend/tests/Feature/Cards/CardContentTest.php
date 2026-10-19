<?php

use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Checklist;
use App\Models\ChecklistItem;
use App\Models\Comment;
use App\Models\EventLogEntry;
use App\Models\Mention;
use Illuminate\Support\Facades\DB;

/*
| Комментарии (все роли, включая commenter), чек-листы и ссылки (editor и admin).
*/

beforeEach(function () {
    $this->space = space(['key' => 'DEV']);
    $this->editor = member(['name' => 'Борис Редактор']);
    $this->commenter = member(['name' => 'Вера Комментатор']);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    addToSpace($this->space, $this->commenter, SpaceRole::Commenter);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor);
});

describe('комментарии', function () {
    it('commenter комментирует; список — от старых к новым, с именами упомянутых', function () {
        $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/comments', [
            'body' => richText('Готово? ', ['mention' => $this->editor->id]),
        ])->assertCreated()
            ->assertJsonPath('data.author.id', $this->commenter->id)
            ->assertJsonPath('data.permissions.modify', true)
            ->assertJsonPath('users', [$this->editor->id => 'Борис Редактор']);
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/comments', ['body' => richText('Да')])->assertCreated();

        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/comments')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.author.id', $this->commenter->id)
            ->assertJsonPath('data.0.permissions.modify', false)
            ->assertJsonPath('data.1.body', fn ($v) => $v == richText('Да'))
            ->assertJsonPath('users', [$this->editor->id => 'Борис Редактор']);

        expect(Mention::query()->sole())->source_type->toBe('comment')->user_id->toBe($this->editor->id);
    });

    it('пустой комментарий не сохраняется', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/comments', ['body' => ['type' => 'doc', 'content' => [['type' => 'paragraph']]]])
            ->assertUnprocessable()->assertJsonPath('errors.body.0', __('selen.comments.empty'));
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/comments', [])->assertUnprocessable();
    });

    it('свой комментарий правят с пометкой «изменено»; чужой — нет', function () {
        $comment = makeComment($this->card, $this->commenter, 'Первый вариант');

        $this->actingAs($this->editor)->patchJson("/api/v1/comments/{$comment->id}", ['body' => richText('Чужая правка')])
            ->assertForbidden();
        $this->actingAs($this->commenter)->patchJson("/api/v1/comments/{$comment->id}", ['body' => richText('Исправленный')])
            ->assertOk()
            ->assertJsonPath('data.edited_at', fn ($v) => $v !== null)
            ->assertJsonPath('data.body', fn ($v) => $v == richText('Исправленный'));
    });

    it('удаление мягкое: строка с пометкой остаётся, текст и упоминания стираются', function () {
        $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/comments', [
            'body' => richText('Секретное мнение ', ['mention' => $this->editor->id]),
        ])->assertCreated();
        $comment = Comment::query()->sole();

        $this->actingAs($this->editor)->deleteJson("/api/v1/comments/{$comment->id}")->assertForbidden();
        $this->actingAs($this->commenter)->deleteJson("/api/v1/comments/{$comment->id}")
            ->assertOk()->assertJsonPath('data.body', null)->assertJsonPath('data.deleted_at', fn ($v) => $v !== null);

        expect(DB::table('comments')->value('body'))->toBeNull()
            ->and(Mention::query()->count())->toBe(0);
        $this->actingAs($this->commenter)->patchJson("/api/v1/comments/{$comment->id}", ['body' => richText('Воскрешение')])
            ->assertUnprocessable()->assertJsonPath('errors.comment.0', __('selen.comments.deleted'));
        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1/comments')->assertJsonPath('data.0.body', null);

        expect(EventLogEntry::query()->where('event_type', 'like', 'card.comment_%')->orderBy('id')->get()
            ->map(fn ($e) => [$e->event_type, $e->payload])->all())
            ->toEqual([
                ['card.comment_added', ['comment_id' => $comment->id]],
                ['card.comment_deleted', ['comment_id' => $comment->id]],
            ]);
        expect(DB::table('event_log')->pluck('payload')->implode(' '))->not->toContain('Секретное');
    });

    it('архивная карточка — комментарии только для чтения', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();

        $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/comments', ['body' => richText('Поздно')])
            ->assertUnprocessable()->assertJsonPath('errors.card.0', __('selen.cards.archived'));
    });
});

describe('чек-листы', function () {
    it('несколько чек-листов с пунктами: отметка, правка, перестановка, удаление', function () {
        $editor = $this->actingAs($this->editor);
        $editor->postJson('/api/v1/cards/DEV-1/checklists', ['title' => 'Перед релизом'])->assertOk();
        $editor->postJson('/api/v1/cards/DEV-1/checklists', ['title' => 'После релиза'])->assertOk()
            ->assertJsonPath('data.checklists.1.title', 'После релиза');
        $list = Checklist::query()->where('title', 'Перед релизом')->sole();

        foreach (['Тесты', 'Миграции', 'Документация'] as $text) {
            $editor->postJson("/api/v1/checklists/{$list->id}/items", ['text' => $text])->assertOk();
        }
        $items = ChecklistItem::query()->orderBy('position')->get()->keyBy('text');

        $editor->patchJson("/api/v1/checklist-items/{$items['Тесты']->id}", ['is_done' => true])->assertOk();
        $editor->patchJson("/api/v1/checklist-items/{$items['Миграции']->id}", ['text' => 'Миграции БД'])->assertOk();
        // «Документация» — в начало
        $editor->postJson("/api/v1/checklist-items/{$items['Документация']->id}/move", ['before_id' => $items['Тесты']->id])
            ->assertOk()
            ->assertJsonPath('data.checklists.0.items.*.text', ['Документация', 'Тесты', 'Миграции БД'])
            ->assertJsonPath('data.checklists.0.items.1.is_done', true);

        // Новый пункт сразу после «Документация»
        $editor->postJson("/api/v1/checklists/{$list->id}/items", ['text' => 'Ревью', 'after_id' => $items['Документация']->id])
            ->assertJsonPath('data.checklists.0.items.1.text', 'Ревью');

        $done = ChecklistItem::query()->where('text', 'Тесты')->sole();
        expect($done->done_by)->toBe($this->editor->id)->and($done->done_at)->not->toBeNull();
        $editor->patchJson("/api/v1/checklist-items/{$done->id}", ['is_done' => false])->assertOk();
        expect($done->fresh()->done_at)->toBeNull();

        $editor->deleteJson("/api/v1/checklist-items/{$done->id}")->assertOk();
        $editor->patchJson("/api/v1/checklists/{$list->id}", ['title' => 'Релиз'])->assertOk()->assertJsonPath('data.checklists.0.title', 'Релиз');
        $editor->deleteJson("/api/v1/checklists/{$list->id}")->assertOk()->assertJsonCount(1, 'data.checklists');
        expect(ChecklistItem::query()->count())->toBe(0);

        expect(loggedEventTypes())->toContain('card.checklist_added', 'card.checklist_item_checked', 'card.checklist_item_unchecked',
            'card.checklist_item_moved', 'card.checklist_item_edited', 'card.checklist_item_removed', 'card.checklist_removed');
        expect(DB::table('event_log')->pluck('payload')->implode(' '))->not->toContain('Миграции');
    });

    it('прогресс чек-листов — на фасаде доски', function () {
        $list = makeChecklist($this->card);
        makeChecklistItem($list)->forceFill(['is_done' => true])->save();
        makeChecklistItem($list);
        makeChecklistItem(makeChecklist($this->card));

        $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}")
            ->assertJsonPath('data.cards.0.checklist', ['done' => 1, 'total' => 3]);
    });

    it('commenter чек-листы не меняет; пункт пустым не бывает', function () {
        $list = makeChecklist($this->card);
        $this->actingAs($this->commenter)->postJson("/api/v1/checklists/{$list->id}/items", ['text' => 'x'])->assertForbidden();
        $this->actingAs($this->editor)->postJson("/api/v1/checklists/{$list->id}/items", ['text' => ''])->assertUnprocessable();
    });
});

describe('ссылки', function () {
    it('добавляет, меняет и удаляет; только http и https', function () {
        $editor = $this->actingAs($this->editor);
        $editor->postJson('/api/v1/cards/DEV-1/links', ['url' => 'https://figma.com/file/abc', 'title' => 'Макет'])
            ->assertOk()
            ->assertJsonPath('data.links.0', fn ($link) => $link['url'] === 'https://figma.com/file/abc' && $link['title'] === 'Макет');

        foreach (['javascript:alert(1)', 'ftp://files', 'не ссылка', 'mailto:a@b.ru'] as $url) {
            $editor->postJson('/api/v1/cards/DEV-1/links', ['url' => $url])->assertUnprocessable()->assertJsonValidationErrors('url');
        }

        $link = $this->card->links()->sole();
        $editor->patchJson("/api/v1/card-links/{$link->id}", ['title' => null])->assertOk()->assertJsonPath('data.links.0.title', null);
        $editor->deleteJson("/api/v1/card-links/{$link->id}")->assertOk()->assertJsonPath('data.links', []);
        $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/links', ['url' => 'https://a.ru'])->assertForbidden();

        expect(EventLogEntry::query()->where('event_type', 'card.link_updated')->sole()->payload)
            ->toEqual(['link_id' => $link->id, 'fields' => ['title']]);
    });
});

it('в журнале событий содержимого карточки нет ПДн', function () {
    $this->actingAs($this->commenter)->postJson('/api/v1/cards/DEV-1/comments', ['body' => richText('Привет, ', ['mention' => $this->editor->id])]);
    $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/checklists', ['title' => 'Список']);

    expectNoPersonalDataInEventLog();
});
