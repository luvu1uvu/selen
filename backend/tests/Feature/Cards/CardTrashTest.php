<?php

use App\Actions\CardBlocks\BlockCardAction;
use App\Actions\CardRelations\AddCardRelationAction;
use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardTransition;
use App\Models\EventLogEntry;
use App\Services\Metrics\CardFlowMetrics;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/*
| Корзина карточек (LATER-45, docs/adr/0015-card-trash.md): удаление мягкое, только системный администратор.
| Карточка в корзине пропадает отовсюду (выборки — SoftDeletes, одиночные проверки и показ — CardVisibility):
| по ссылке 404 как для чужой, в связях и блокировках — «Удалённая карточка» без номера и названия, в метриках
| не участвует. История, содержимое и файлы остаются; «Администрирование → Корзина» возвращает её на место.
*/

beforeEach(function () {
    Storage::fake('attachments');
    $this->space = space(['key' => 'DEV']);
    $this->sysadmin = admin();
    $this->editor = member();
    // Системный администратор — с самой слабой ролью: удалять ему позволяет системная роль, а не роль пространства
    addToSpace($this->space, $this->sysadmin, SpaceRole::Commenter);
    addToSpace($this->space, $this->editor, SpaceRole::Editor);
    $this->board = makeBoard($this->space, $this->editor, BoardTemplate::Simple);
    $this->card = makeCard($this->board, 'To Do', $this->editor, 'Секретный проект');   // DEV-1
    $this->other = makeCard($this->board, 'To Do', $this->editor, 'Соседняя');          // DEV-2
    $this->delete = fn (string $key = 'DEV-1') => $this->actingAs($this->sysadmin)->deleteJson("/api/v1/cards/{$key}");
});

it('в «Корзине» название — только тому, кто видел бы карточку: при «только своих» чужая — без названия (ADR-0008)', function () {
    $restricted = admin();
    addToSpaceViaGroup($this->space, $restricted, SpaceRole::Commenter, true);
    $this->other->forceFill(['customer_id' => $restricted->id])->save();
    ($this->delete)('DEV-1')->assertNoContent();
    ($this->delete)('DEV-2')->assertNoContent();

    $rows = collect($this->actingAs($restricted)->getJson(adminPath().'trash/cards')->assertOk()->json('data'))->keyBy('key');

    expect($rows['DEV-1'])->toMatchArray(['title' => null, 'title_hidden' => true])
        ->and($rows['DEV-2'])->toMatchArray(['title' => 'Соседняя', 'title_hidden' => false])
        ->and(json_encode($rows->all(), JSON_UNESCAPED_UNICODE))->not->toContain('Секретный проект');
});

describe('удаление', function () {
    it('помечает карточку удалённой, история, содержимое и файлы остаются', function () {
        $card = moveCard($this->card, 'In Progress', $this->editor);
        makeComment($card, $this->editor);
        $attachment = makeAttachment($card, $this->editor);
        $transitions = DB::table('card_transitions')->where('card_id', $card->id)->count();

        ($this->delete)()->assertNoContent();

        $trashed = Card::withTrashed()->findOrFail($card->id);
        expect($trashed->trashed())->toBeTrue()
            ->and($trashed->deleted_by)->toBe($this->sysadmin->id)
            ->and(DB::table('card_transitions')->where('card_id', $card->id)->count())->toBe($transitions)
            ->and(DB::table('comments')->where('card_id', $card->id)->exists())->toBeTrue()
            ->and(DB::table('attachments')->where('card_id', $card->id)->whereNull('deleted_at')->exists())->toBeTrue();
        Storage::disk('attachments')->assertExists($attachment->path);

        expect(EventLogEntry::query()->where('event_type', 'card.deleted')->sole())
            ->subject_id->toBe($card->id)
            ->actor_id->toBe($this->sysadmin->id)
            ->payload->toEqual([]);
        expectNoPersonalDataInEventLog();
    });

    it('администратору и редактору пространства — 403; в архивной доске — 403 с текстом', function () {
        $spaceAdmin = member();
        addToSpace($this->space, $spaceAdmin, SpaceRole::Admin);

        foreach ([$spaceAdmin, $this->editor] as $user) {
            $this->actingAs($user)->deleteJson('/api/v1/cards/DEV-1')->assertForbidden();
            $this->getJson('/api/v1/cards/DEV-1')->assertJsonPath('data.permissions.delete', false);
        }
        $this->actingAs($this->sysadmin)->getJson('/api/v1/cards/DEV-1')->assertJsonPath('data.permissions.delete', true);

        $this->getJson("/api/v1/boards/{$this->board->id}")->assertJsonPath('data.permissions.delete_cards', true);
        $this->actingAs($spaceAdmin)->getJson("/api/v1/boards/{$this->board->id}")->assertJsonPath('data.permissions.delete_cards', false);

        $this->board->forceFill(['archived_at' => now()])->save();
        $this->actingAs($this->sysadmin)->getJson("/api/v1/boards/{$this->board->id}")->assertJsonPath('data.permissions.delete_cards', false);
        ($this->delete)()->assertForbidden()->assertJsonPath('message', __('selen.boards.archived'));
        expect(Card::query()->whereKey($this->card->id)->exists())->toBeTrue();
    });

    it('системному администратору не из пространства — 404', function () {
        $this->actingAs(admin())->deleteJson('/api/v1/cards/DEV-1')->assertNotFound();
        expect(Card::query()->whereKey($this->card->id)->exists())->toBeTrue();
    });

    it('архивная карточка удаляется так же и пропадает из архива', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();

        ($this->delete)()->assertNoContent();

        $this->actingAs($this->editor)->getJson("/api/v1/boards/{$this->board->id}/archived-cards")
            ->assertOk()->assertJsonCount(0, 'data');
    });
});

describe('карточка в корзине пропадает отовсюду', function () {
    it('по ссылке и по всем вложенным маршрутам — 404 как для чужой, в том числе системному администратору', function () {
        $comment = makeComment($this->card, $this->editor);
        $checklist = makeChecklist($this->card);
        $item = makeChecklistItem($checklist);
        $link = makeCardLink($this->card, $this->editor);
        $attachment = makeAttachment($this->card, $this->editor);
        $block = makeBlock($this->card, $this->editor);
        ($this->delete)()->assertNoContent();

        $routes = [
            ['GET', 'cards/DEV-1'], ['PATCH', 'cards/DEV-1'], ['GET', 'cards/DEV-1/history'],
            ['GET', 'cards/DEV-1/transitions'], ['GET', 'cards/DEV-1/comments'], ['POST', 'cards/DEV-1/archive'],
            ['DELETE', 'cards/DEV-1'], ['PATCH', "comments/{$comment->id}"], ['PATCH', "checklists/{$checklist->id}"],
            ['PATCH', "checklist-items/{$item->id}"], ['PATCH', "card-links/{$link->id}"],
            ['GET', "attachments/{$attachment->id}"], ['POST', "card-blocks/{$block->id}/resolve"],
        ];
        foreach ([$this->sysadmin, $this->editor] as $user) {
            foreach ($routes as [$method, $path]) {
                $this->actingAs($user)->json($method, "/api/v1/{$path}", ['title' => 'x', 'text' => 'x', 'url' => 'https://e.com'])
                    ->assertNotFound()
                    ->assertExactJson(['message' => __('selen.not_found')]);
            }
        }
    });

    it('нет на доске, в поиске и в счётчиках пространства', function () {
        ($this->delete)()->assertNoContent();
        $this->actingAs($this->editor);

        expect(collect($this->getJson("/api/v1/boards/{$this->board->id}")->json('data.cards'))->pluck('key')->all())
            ->toBe(['DEV-2']);
        $this->getJson('/api/v1/spaces/DEV/cards?search=Секретный')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/spaces/DEV/cards?search=1')->assertOk()->assertJsonMissing(['key' => 'DEV-1']);
        expect(Card::query()->where('space_id', $this->space->id)->count())->toBe(1);
    });

    it('в связях и блокировках соседних — «удалённая» без номера и названия; блокировка, где она блокирующая, снята', function () {
        $child = makeCard($this->board, 'To Do', $this->editor, 'Дочерняя');   // DEV-3
        makeRelation($this->card, $child, $this->editor);                       // DEV-1 — родитель DEV-3
        makeRelation($this->other, $this->card, $this->editor);                 // DEV-2 — родитель DEV-1
        $open = makeBlock($this->other, $this->editor, $this->card);

        ($this->delete)()->assertNoContent();

        expect(CardBlock::query()->findOrFail($open->id))
            ->ended_at->not->toBeNull()
            ->ended_by->toBe($this->sysadmin->id)
            ->end_reason->value->toBe('blocker_deleted');
        expect(EventLogEntry::query()->where('event_type', 'card.unblocked')->sole())
            ->subject_id->toBe($this->other->id)
            ->payload->toEqual(['block_id' => $open->id, 'blocking_card_id' => $this->card->id, 'end_reason' => 'blocker_deleted']);

        $this->actingAs($this->editor);
        $other = $this->getJson('/api/v1/cards/DEV-2')->assertOk();
        expect($other->json('data.relations.children.0.card'))->toBe(['hidden' => true, 'deleted' => true])
            ->and($other->json('data.relations.progress'))->toBeNull()
            ->and($other->json('data.blocks.0.blocking_card'))->toBe(['hidden' => true, 'deleted' => true])
            ->and($other->json('data.blocks.0.end_reason'))->toBe('blocker_deleted');
        expect($this->getJson('/api/v1/cards/DEV-3')->json('data.relations.parents.0.card'))->toBe(['hidden' => true, 'deleted' => true]);

        $history = $this->getJson('/api/v1/cards/DEV-2/history')->assertOk();
        expect(collect($history->json('data'))->firstWhere('event_type', 'card.unblocked')['payload']['blocking_card_id'])->toBe('deleted')
            ->and($history->json('refs.cards'))->not->toHaveKey($this->card->id);

        // Название удалённой карточки не утекает ни в один ответ соседних
        foreach (['/api/v1/cards/DEV-2', '/api/v1/cards/DEV-3', '/api/v1/cards/DEV-2/history', "/api/v1/boards/{$this->board->id}"] as $url) {
            expect($this->getJson($url)->content())->not->toContain('Секретный')->not->toContain('DEV-1"');
        }
    });

    it('зрителю «только свои» удалённая карточка, которую он и так не видел, остаётся «скрытой»', function () {
        $viewer = member();
        addToSpace($this->space, $viewer, SpaceRole::Editor);
        restrictToOwnCards($viewer, $this->space);
        $this->other->forceFill(['responsible_id' => $viewer->id])->save();   // DEV-2 — «своя»
        makeRelation($this->other, $this->card, $this->editor);

        ($this->delete)()->assertNoContent();

        $this->actingAs($viewer)->getJson('/api/v1/cards/DEV-2')
            ->assertJsonPath('data.relations.children.0.card', ['hidden' => true]);
        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-2')
            ->assertJsonPath('data.relations.children.0.card', ['hidden' => true, 'deleted' => true]);
    });

    it('блокировка и связь с удалённой карточкой не создаются, даже если запрос нашёл её до удаления', function () {
        $stale = Card::query()->findOrFail($this->card->id);   // как FormRequest — до транзакции
        ($this->delete)()->assertNoContent();

        expect(fn () => app(BlockCardAction::class)->handle($this->editor, $this->other, null, true, $stale))
            ->toThrow(ValidationException::class)
            ->and(fn () => app(AddCardRelationAction::class)->handle($this->editor, $this->other, $stale, 'child'))
            ->toThrow(ValidationException::class);
        expect(CardBlock::query()->exists())->toBeFalse()
            ->and(DB::table('card_relations')->exists())->toBeFalse();
    });

    it('прогресс родителя не считает удалённую дочернюю', function () {
        $done = moveCard(makeCard($this->board, 'To Do', $this->editor), 'Done', $this->editor);   // DEV-3
        makeRelation($this->other, $this->card, $this->editor);
        makeRelation($this->other, $done, $this->editor);

        ($this->delete)()->assertNoContent();

        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-2')
            ->assertJsonPath('data.relations.progress', ['done' => 1, 'total' => 1]);
    });

    it('метрики по умолчанию не видят переходов удалённой карточки; история остаётся в базе', function () {
        moveCard($this->card, 'In Progress', $this->editor);
        moveCard($this->card, 'Done', $this->editor);
        ($this->delete)()->assertNoContent();
        $trashed = Card::withTrashed()->findOrFail($this->card->id);

        expect(CardTransition::query()->where('card_id', $trashed->id)->exists())->toBeFalse()
            ->and(CardTransition::query()->withoutGlobalScope(CardTransition::OF_LIVE_CARDS)->where('card_id', $trashed->id)->count())->toBe(3)
            ->and(app(CardFlowMetrics::class)->forCard($trashed)->leadTimeSeconds())->toBeNull()
            ->and(CardTransition::query()->where('card_id', $this->other->id)->exists())->toBeTrue();

        $this->artisan('app:flow-metrics', ['space' => 'DEV'])
            ->expectsTable(
                ['Доска', 'Всего', 'В работе', 'Завершено', 'Lead: среднее', 'Lead: медиана', 'Cycle: среднее', 'Cycle: медиана'],
                [['Доска', 1, 0, 0, '—', '—', '—', '—']],
            );
    });

    it('позиция удалённой карточки не мешает новым в той же ячейке', function () {
        ($this->delete)('DEV-2')->assertNoContent();   // последняя в «To Do»

        $this->actingAs($this->editor)->postJson("/api/v1/boards/{$this->board->id}/cards", [
            'title' => 'Новая', 'column_id' => columnNamed($this->board, 'To Do')->id, 'lane_id' => firstLane($this->board)->id,
        ])->assertCreated()->assertJsonPath('data.key', 'DEV-3');   // номер удалённой не переиспользуется
    });
});

describe('«Администрирование → Корзина»', function () {
    it('список — только системному администратору: номер, название, где лежала, кто и когда удалил', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-2/archive')->assertOk();
        ($this->delete)('DEV-1')->assertNoContent();
        $this->travel(1)->minutes();
        ($this->delete)('DEV-2')->assertNoContent();

        $this->actingAs($this->sysadmin)->getJson(adminPath().'trash/cards')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('data.0.key', 'DEV-2')
            ->assertJsonPath('data.0.archived', true)
            ->assertJsonPath('data.1.key', 'DEV-1')
            ->assertJsonPath('data.1.title', 'Секретный проект')
            ->assertJsonPath('data.1.space', ['id' => $this->space->id, 'key' => 'DEV', 'name' => $this->space->name])
            ->assertJsonPath('data.1.board.id', $this->board->id)
            ->assertJsonPath('data.1.archived', false)
            ->assertJsonPath('data.1.deleted_by', ['id' => $this->sysadmin->id, 'name' => $this->sysadmin->name]);

        $spaceAdmin = member();
        addToSpace($this->space, $spaceAdmin, SpaceRole::Admin);
        $this->actingAs($spaceAdmin)->getJson(adminPath().'trash/cards')->assertForbidden();
        $this->actingAs($spaceAdmin)->postJson(adminPath().'trash/cards/DEV-1/restore')->assertForbidden();
    });

    it('администратору без доступа к пространству название не отдаётся — ни в списке, ни при восстановлении', function () {
        ($this->delete)()->assertNoContent();
        $stranger = admin();   // системный администратор, не участник «DEV»

        $list = $this->actingAs($stranger)->getJson(adminPath().'trash/cards')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'DEV-1')
            ->assertJsonPath('data.0.title', null)
            ->assertJsonPath('data.0.title_hidden', true)
            ->assertJsonPath('data.0.space.name', $this->space->name)
            ->assertJsonPath('data.0.board.id', $this->board->id)
            ->assertJsonPath('data.0.deleted_by.id', $this->sysadmin->id);
        expect($list->getContent())->not->toContain('Секретный');

        // Участник пространства (тот, кто удалял) название видит
        $this->actingAs($this->sysadmin)->getJson(adminPath().'trash/cards')
            ->assertJsonPath('data.0.title', 'Секретный проект')
            ->assertJsonPath('data.0.title_hidden', false);

        // «Восстановить» доступно и без доступа к пространству; название в ответ не уходит
        $restore = $this->actingAs($stranger)->postJson(adminPath().'trash/cards/DEV-1/restore')
            ->assertOk()
            ->assertJsonPath('data.title_hidden', true);
        expect($restore->getContent())->not->toContain('Секретный')
            ->and(Card::query()->whereKey($this->card->id)->exists())->toBeTrue();
    });

    it('восстановление возвращает карточку в её ячейку (в конец) со всей историей', function () {
        $card = moveCard($this->card, 'In Progress', $this->editor);
        makeComment($card, $this->editor);
        ($this->delete)()->assertNoContent();
        $neighbour = makeCard($this->board, 'In Progress', $this->editor, 'Пока лежала в корзине');

        $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore')
            ->assertOk()
            ->assertJsonPath('data.key', 'DEV-1')
            ->assertJsonPath('data.deleted_at', null);

        $restored = Card::query()->findOrFail($card->id);
        expect($restored->column_id)->toBe(columnNamed($this->board, 'In Progress')->id)
            ->and(strcmp($restored->position, $neighbour->fresh()->position))->toBeGreaterThan(0)
            ->and($restored->deleted_by)->toBeNull();
        expect(EventLogEntry::query()->where('event_type', 'card.restored_from_trash')->sole())
            ->subject_id->toBe($card->id)->payload->toEqual([]);

        $this->actingAs($this->editor)->getJson('/api/v1/cards/DEV-1')->assertOk()->assertJsonPath('data.title', 'Секретный проект');
        $this->getJson('/api/v1/cards/DEV-1/comments')->assertOk()->assertJsonCount(1, 'data');
        expect(CardTransition::query()->where('card_id', $card->id)->count())->toBe(2);
    });

    it('колонку тем временем архивировали — по правилам архива: первая колонка доски, переход в истории', function () {
        $card = moveCard($this->card, 'Review', $this->editor);
        ($this->delete)()->assertNoContent();
        $review = columnNamed($this->board, 'Review');
        $review->forceFill(['archived_at' => now()])->save();   // карточек на доске в колонке нет — архивируется

        $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore')->assertOk();

        expect(Card::query()->findOrFail($card->id)->column_id)->toBe(columnNamed($this->board, 'To Do')->id)
            ->and(CardTransition::query()->where('card_id', $card->id)->orderByDesc('id')->first())
            ->from_column_id->toBe($review->id)
            ->reason->value->toBe('manual');
    });

    it('архивная возвращается в архив; не удалённую восстановить нельзя — 404', function () {
        $this->actingAs($this->editor)->postJson('/api/v1/cards/DEV-1/archive')->assertOk();
        ($this->delete)()->assertNoContent();

        $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore')
            ->assertOk()->assertJsonPath('data.archived', true);
        expect(Card::query()->findOrFail($this->card->id)->isArchived())->toBeTrue();

        $this->postJson(adminPath().'trash/cards/DEV-2/restore')->assertNotFound();
        $this->postJson(adminPath().'trash/cards/DEV-99/restore')->assertNotFound();
    });

    it('из архивных доски и пространства не возвращается — 422 с понятным текстом, карточка в корзине', function () {
        ($this->delete)()->assertNoContent();
        $restore = fn () => $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore');

        $this->board->forceFill(['archived_at' => now()])->save();
        $restore()->assertUnprocessable()
            ->assertJsonPath('errors.card.0', __('selen.cards.trash_board_archived', ['board' => $this->board->name]));

        $this->board->forceFill(['archived_at' => null])->save();
        $this->space->forceFill(['archived_at' => now()])->save();
        $restore()->assertUnprocessable()
            ->assertJsonPath('errors.card.0', __('selen.cards.trash_space_archived', ['space' => $this->space->name]));

        expect(Card::onlyTrashed()->whereKey($this->card->id)->exists())->toBeTrue();
    });

    it('колонке сменили тип, пока карточка в корзине: при возврате — переход «тип колонки изменён», метрики сходятся', function () {
        $spaceAdmin = member();
        addToSpace($this->space, $spaceAdmin, SpaceRole::Admin);
        $card = moveCard($this->card, 'In Progress', $this->editor);
        ($this->delete)()->assertNoContent();
        $this->actingAs($spaceAdmin)->putJson('/api/v1/columns/'.columnNamed($this->board, 'In Progress')->id.'/category', ['category' => 'done'])->assertOk();

        $this->actingAs(admin())->postJson(adminPath().'trash/cards/DEV-1/restore')->assertOk();

        $restored = Card::query()->findOrFail($card->id);
        expect($restored->completed_at)->not->toBeNull()
            ->and(CardTransition::query()->where('card_id', $card->id)->orderByDesc('id')->first())
            ->reason->value->toBe('column_type_changed')
            ->to_category->value->toBe('done')
            ->and(app(CardFlowMetrics::class)->forCard($restored)->leadTimeSeconds())->not->toBeNull();
    });

    it('восстановить может только системный администратор: остальным 403 — и для существующего номера, и для несуществующего', function () {
        ($this->delete)()->assertNoContent();

        foreach (['DEV-1', 'DEV-2', 'DEV-99', 'NOPE-1'] as $key) {
            $this->actingAs($this->editor)->postJson(adminPath()."trash/cards/{$key}/restore")
                ->assertForbidden();
        }
        expect(Card::onlyTrashed()->whereKey($this->card->id)->exists())->toBeTrue();
    });
});
