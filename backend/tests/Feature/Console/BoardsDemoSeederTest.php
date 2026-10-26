<?php

use App\Enums\SpaceRole;
use App\Models\Attachment;
use App\Models\Board;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardRelation;
use App\Models\CardTransition;
use App\Models\Checklist;
use App\Models\Comment;
use App\Models\Label;
use App\Models\Mention;
use App\Models\Space;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use App\Services\Metrics\CardFlowMetrics;
use App\Services\Navigation\NavigationTree;
use Database\Seeders\BoardsDemoSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

it('демо-данные: четыре пространства в дереве, доска на 300 карточек, история за 60 дней согласована, сводка метрик', function () {
    Storage::fake('attachments');
    $this->seed([DemoSeeder::class, BoardsDemoSeeder::class]);

    expect(Space::query()->orderBy('key')->pluck('key')->all())->toBe(['COMP', 'DEV', 'MKT', 'OPS', 'PROMO'])
        ->and(Board::query()->where('name', 'Продукт')->sole()->cards()->count())->toBe(300)
        ->and(Card::query()->count())->toBeGreaterThan(350);

    // Вся история — в прошлом и в пределах 60 дней
    expect(CardTransition::query()->where('moved_at', '>', now())->exists())->toBeFalse()
        ->and(CardTransition::query()->min('moved_at'))->toBeGreaterThan(now()->subDays(62)->toDateTimeString())
        ->and(CardTransition::query()->where('reason', 'manual')->count())->toBeGreaterThan(1000);

    // Денормализованные поля совпадают с расчётом по истории
    $metrics = app(CardFlowMetrics::class);
    $completed = 0;
    foreach (Card::query()->get() as $card) {
        $times = $metrics->forCard($card);
        expect($card->completed_at?->toIso8601String())->toBe($times->completedAt?->toIso8601String())
            ->and($card->first_started_at?->toIso8601String())->toBe($times->firstStartedAt?->toIso8601String());
        $completed += $times->completedAt === null ? 0 : 1;
    }
    expect($completed)->toBeGreaterThan(50);

    // member@selen.test есть только в DEV (его группа «Стажёры» в архиве и доступа в MKT не даёт)
    // и в «Компании», открытой группе «Все сотрудники»
    $demo = User::query()->where('email', 'member@selen.test')->sole();
    expect(Space::query()->visibleTo($demo)->orderBy('key')->pluck('key')->all())->toBe(['COMP', 'DEV']);
    // У него одна компания — одно дерево без названия (ADR-0024)
    [$only] = app(NavigationTree::class)->forUser($demo);
    expect($only['name'])->toBeNull();
    $tree = $only['items'];
    expect(collect($tree)->map(fn (array $node) => $node['name'] ?? $node['space']['key'])->all())->toBe(['COMP', 'Продуктовые команды'])
        ->and($tree[0]['everyone'])->toBeTrue()
        ->and($tree[1]['children'][0]['space']['key'])->toBe('DEV');
    // Группы: grigory через «Руководителей» видит OPS и MKT
    $grigory = User::query()->where('email', 'grigory@selen.test')->sole();
    expect(Space::query()->visibleTo($grigory)->orderBy('key')->pluck('key')->all())->toBe(['COMP', 'DEV', 'MKT', 'OPS'])
        ->and(Space::query()->where('key', 'OPS')->sole()->roleOf($grigory))->toBe(SpaceRole::Commenter);

    // Фасады заполнены; zhanna@selen.test в режиме «только свои карточки» видит только свои
    $product = Board::query()->where('name', 'Продукт')->sole();
    expect(Label::query()->count())->toBe(6)
        ->and(DB::table('card_labels')->count())->toBeGreaterThan(100)
        ->and(Card::query()->whereNotNull('due_date')->orWhereNotNull('due_at')->count())->toBeGreaterThan(50)
        ->and(Card::query()->where('is_urgent', true)->count())->toBeGreaterThan(5)
        ->and(Checklist::query()->count())->toBeGreaterThan(50)
        ->and(Comment::query()->count())->toBeGreaterThan(50)
        ->and(Mention::query()->count())->toBe(Comment::query()->count())
        ->and(Attachment::query()->count())->toBeGreaterThan(5);
    foreach (Attachment::query()->get() as $attachment) {
        expect(Storage::disk('attachments')->exists($attachment->path))->toBeTrue();
    }
    $zhanna = User::query()->where('email', 'zhanna@selen.test')->sole();
    $visible = app(CardVisibility::class)->scope(Card::query()->where('board_id', $product->id), $zhanna, $product->space)->count();
    expect($visible)->toBe(10);
    // Поправка A: упомянуты только те, кто видит карточку
    foreach (Mention::query()->get() as $mention) {
        expect(app(CardVisibility::class)->canSee(User::query()->findOrFail($mention->user_id), Card::query()->findOrFail($mention->card_id)))->toBeTrue();
    }
    // Связи и блокировки: эпики с дочерними, активные и снятые эпизоды; у подрядчика — «Скрытая карточка»
    expect(CardRelation::query()->count())->toBeGreaterThan(10)
        ->and(CardBlock::query()->whereNull('ended_at')->count())->toBeGreaterThan(10)
        ->and(CardBlock::query()->where('end_reason', 'manual')->count())->toBe(6);
    $hiddenBlocker = CardBlock::query()->whereNull('ended_at')->whereNotNull('blocking_card_id')->with(['card.space', 'blockingCard.space'])->get()
        ->first(fn (CardBlock $b) => $b->card->involves($zhanna) && ! app(CardVisibility::class)->canSee($zhanna, $b->blockingCard));
    expect($hiddenBlocker)->not->toBeNull();
    expectNoPersonalDataInEventLog();

    // Сводка метрик по этим данным (сидер долгий — проверяем в том же тесте)
    $this->artisan('app:flow-metrics', ['space' => 'dev', '--days' => 60])
        ->expectsOutputToContain('DEV «Разработка»')
        ->expectsOutputToContain('Продукт')
        ->assertSuccessful();

    $this->artisan('app:flow-metrics', ['space' => 'NOPE'])->assertFailed();
});
