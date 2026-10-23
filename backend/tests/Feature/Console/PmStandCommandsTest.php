<?php

use App\Actions\Boards\UpdateBoardAction;
use App\Actions\Comments\AddCommentAction;
use App\Actions\Spaces\RemoveSpaceMemberAction;
use App\Enums\ColumnCategory;
use App\Enums\SpaceRole;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Attachment;
use App\Models\Card;
use App\Models\Comment;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;
use App\Services\PmStand\PmStand;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

/**
 * Команды стенда PM (ADR-0014): pm:backlog, pm:qa-bot, pm:bug, pm:bug-move.
 */
const DEFERRED_YAML = __DIR__.'/../../../../docs/pm/deferred.yaml';

/** Временный файл с содержимым (YAML, JSON, картинка). */
function standFile(string $content, string $extension): string
{
    $path = sys_get_temp_dir().'/pm-'.uniqid().'.'.$extension;
    file_put_contents($path, $content);

    return $path;
}

function deferredYaml(): string
{
    return standFile(<<<'YAML'
        - title: Таймер
          column: Идеи / без решения
          description: |-
            Запуск таймера на карточке.
            Вторая строка — второй абзац.
        - title: Избранное
          column: Отложено до этапа
          labels: [этап 7, UX]
          description: Быстрый доступ к доскам.
        YAML, 'yaml');
}

/** Стенд после make pm-backlog: PM (системный администратор) и пространство LATER. */
function setUpStand(): User
{
    $owner = admin(['email' => 'pm@selen.test']);
    test()->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])->assertSuccessful();

    return $owner;
}

function setUpBot(string $password = 'bot-password-123'): User
{
    putenv("QA_BOT_PASSWORD={$password}");
    test()->artisan('pm:qa-bot', ['owner' => 'pm@selen.test', 'email' => 'qa-bot@selen.local'])->assertSuccessful();
    putenv('QA_BOT_PASSWORD');

    return User::query()->where('email', 'qa-bot@selen.local')->sole();
}

function bugJson(array $override = []): string
{
    return standFile(json_encode($override + [
        'title' => 'Кнопка «Архив карточек» уезжает',
        'test_case' => 'ТК-3.5. Широкая доска',
        'steps' => ['Открыть доску «Продукт»', 'Прокрутить вбок'],
        'expected' => 'Кнопка на месте.',
        'actual' => 'Кнопка уехала влево.',
        'substage' => '3c',
    ], JSON_UNESCAPED_UNICODE), 'json');
}

function bugsBoardCards(): array
{
    $board = PmStand::requireBoard(PmStand::requireSpace(), PmStand::BUGS_BOARD);

    return $board->cards()->with('column')->get()->map(fn (Card $card) => [$card->title, $card->column->name])->all();
}

describe('pm:backlog', function () {
    it('создаёт LATER: PM — единственный администратор, метки, доски с колонками, карточки из YAML', function () {
        $owner = setUpStand();

        $space = Space::query()->where('key', 'LATER')->sole();
        expect($space->name)->toBe('Временно, пока реализовывается')
            ->and($space->roleOf($owner))->toBe(SpaceRole::Admin)
            ->and($space->personalGrants()->count())->toBe(1);

        expect(Label::query()->where('space_id', $space->id)->orderBy('name')->pluck('name')->all())
            ->toEqualCanonicalizing(array_keys(PmStand::LABELS));

        $columns = fn (string $board) => PmStand::requireBoard($space, $board)->columns()->orderBy('position')->get()
            ->map(fn ($c) => [$c->name, $c->category])->all();
        expect($columns('Бэклог'))->toBe([
            ['Идеи / без решения', ColumnCategory::Queue],
            ['Отложено до этапа', ColumnCategory::Queue],
            ['Взято в работу', ColumnCategory::InProgress],
            ['Сделано', ColumnCategory::Done],
        ])->and($columns('Баги приёмки'))->toBe([
            ['Новый', ColumnCategory::Queue],
            ['Исправляется', ColumnCategory::InProgress],
            ['Исправлено', ColumnCategory::Done],
            ['Не баг — решение PM', ColumnCategory::Done],
        ]);

        $timer = Card::query()->where('title', 'Таймер')->sole();
        expect($timer->column->name)->toBe('Идеи / без решения')
            ->and($timer->description['content'])->toHaveCount(2)
            ->and($timer->description['content'][1]['content'][0]['text'])->toBe('Вторая строка — второй абзац.');
        $favorites = Card::query()->where('title', 'Избранное')->sole();
        expect($favorites->column->name)->toBe('Отложено до этапа')
            ->and($favorites->labels()->pluck('name')->all())->toEqualCanonicalizing(['этап 7', 'UX']);

        expectNoPersonalDataInEventLog();
    });

    it('повторный запуск ничего не дублирует и не трогает изменённые, архивные и удалённые в корзину карточки', function () {
        $owner = setUpStand();
        $timer = Card::query()->where('title', 'Таймер')->sole();
        moveCard($timer, 'Взято в работу', $owner);
        Card::query()->where('title', 'Избранное')->update(['archived_at' => now()]);
        $this->travel(1)->minutes();
        Card::query()->where('title', 'Избранное')->update(['deleted_at' => now(), 'deleted_by' => $owner->id]);

        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])
            ->expectsOutputToContain('Карточек добавлено: 0, уже были: 2')
            ->assertSuccessful();

        expect(Space::query()->count())->toBe(1)
            ->and(Card::withTrashed()->count())->toBe(2)
            ->and(Label::query()->count())->toBe(count(PmStand::LABELS))
            ->and(PmStand::requireSpace()->boards()->count())->toBe(2)
            ->and($timer->fresh()->column->name)->toBe('Взято в работу');
    });

    it('проверяет файл до изменений: неизвестная колонка или метка — ошибка, ничего не создано', function (string $yaml, string $error) {
        admin(['email' => 'pm@selen.test']);

        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => standFile($yaml, 'yaml')])
            ->expectsOutputToContain($error)
            ->assertFailed();

        expect(Space::query()->count())->toBe(0);
    })->with([
        'колонка' => ["- {title: A, column: Потом, description: B}\n", 'column'],
        'метка' => ["- {title: A, column: Сделано, labels: [этап 99], description: B}\n", 'labels'],
        'без описания' => ["- {title: A, column: Сделано}\n", 'description'],
        'не YAML' => ["- [a\n", 'Не удалось прочитать'],
    ]);

    it('без учётной записи PM — подсказка про make pm-owner; не администратор — нет прав', function () {
        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])
            ->expectsOutputToContain('make pm-owner')
            ->assertFailed();

        // Опечатка в email при существующей учётной записи — подсказка с её email, а не «заведите учётную запись»
        admin(['email' => 'boss@selen.test']);
        $this->artisan('pm:backlog', ['owner' => 'boss@selen.testl', 'file' => deferredYaml()])
            ->expectsOutputToContain('опечатку. Администраторы на стенде: boss@selen.test')
            ->doesntExpectOutputToContain('make pm-owner')
            ->assertFailed();

        member(['email' => 'pm@selen.test']);
        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])
            ->expectsOutputToContain('Нет прав')
            ->assertFailed();
        expect(Space::query()->count())->toBe(0);
    });

    it('доска «Баги приёмки»: шаблон бага в описании; на уже работающем стенде — дописывается, правки PM не трогаются', function () {
        $owner = setUpStand();
        $bugs = PmStand::requireBoard(PmStand::requireSpace(), 'Баги приёмки');
        expect($bugs->description)->toContain('Шаги воспроизведения')->toContain('метка «UX»');

        // Стенд, созданный до шаблона: описания нет — повторный pm-backlog его дописывает, остальное не меняет
        $bugs->forceFill(['description' => null])->save();
        $cards = Card::query()->count();
        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])->assertSuccessful();
        expect($bugs->fresh()->description)->toBe(PmStand::BUGS_BOARD_DESCRIPTION)
            ->and(Card::query()->count())->toBe($cards)
            ->and($bugs->columns()->count())->toBe(4);

        // PM поправил описание — повторный запуск его не перезаписывает
        app(UpdateBoardAction::class)->handle($owner, $bugs, ['description' => 'Своё описание']);
        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => deferredYaml()])->assertSuccessful();
        expect($bugs->fresh()->description)->toBe('Своё описание');
    });

    it('docs/pm/deferred.yaml из репозитория импортируется целиком', function () {
        admin(['email' => 'pm@selen.test']);

        $this->artisan('pm:backlog', ['owner' => 'pm@selen.test', 'file' => DEFERRED_YAML])->assertSuccessful();

        expect(Card::query()->count())->toBeGreaterThan(20)
            ->and(Card::query()->whereNull('description')->count())->toBe(0);
    })->skip(! is_file(DEFERRED_YAML), 'docs/pm недоступен в этом окружении');
});

describe('pm:qa-bot', function () {
    it('создаёт QA-бота: обычный сотрудник, editor в LATER; пароль — из QA_BOT_PASSWORD', function () {
        setUpStand();
        $bot = setUpBot();

        expect($bot->name)->toBe('QA-бот')
            ->and($bot->role)->toBe(UserRole::Member)
            ->and(Hash::check('bot-password-123', $bot->password))->toBeTrue()
            ->and(PmStand::requireSpace()->roleOf($bot))->toBe(SpaceRole::Editor)
            ->and(Space::accessesOf($bot)->keys()->all())->toBe([PmStand::requireSpace()->id]);
    });

    it('повторный запуск приводит пароль к .env и не дублирует бота и участие', function () {
        setUpStand();
        setUpBot();
        $bot = setUpBot('new-bot-password-456');

        expect(User::query()->where('email', 'qa-bot@selen.local')->count())->toBe(1)
            ->and(Hash::check('new-bot-password-456', $bot->password))->toBeTrue()
            ->and(PmStand::requireSpace()->personalGrants()->count())->toBe(2);
    });

    it('без пароля или без LATER — понятная ошибка', function () {
        admin(['email' => 'pm@selen.test']);
        putenv('QA_BOT_PASSWORD');
        $this->artisan('pm:qa-bot', ['owner' => 'pm@selen.test', 'email' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('QA_BOT_PASSWORD')
            ->assertFailed();

        putenv('QA_BOT_PASSWORD=bot-password-123');
        $this->artisan('pm:qa-bot', ['owner' => 'pm@selen.test', 'email' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('make pm-backlog')
            ->assertFailed();
        putenv('QA_BOT_PASSWORD');

        expect(User::query()->count())->toBe(1);
    });

    it('администратор системы QA-ботом быть не может', function () {
        setUpStand();
        admin(['email' => 'qa-bot@selen.local']);
        putenv('QA_BOT_PASSWORD=bot-password-123');

        $this->artisan('pm:qa-bot', ['owner' => 'pm@selen.test', 'email' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('QA-ботом быть не может')
            ->assertFailed();
        putenv('QA_BOT_PASSWORD');
    });
});

describe('pm:bug и pm:bug-move', function () {
    beforeEach(fn () => Storage::fake('attachments'));

    it('заводит баг от имени QA-бота: тип «Баг», шаблон описания, метка подэтапа, скриншот', function () {
        setUpStand();
        $bot = setUpBot();
        $screenshot = standFile(PNG_1X1, 'png');

        $this->artisan('pm:bug', [
            'file' => bugJson(['screenshot' => $screenshot]),
            '--owner' => 'pm@selen.test',
            '--bot' => 'qa-bot@selen.local',
        ])->expectsOutputToContain('LATER-')->assertSuccessful();

        $card = Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->sole();
        expect($card->title)->toBe('Кнопка «Архив карточек» уезжает')
            ->and($card->column->name)->toBe('Новый')
            ->and($card->type->name)->toBe('Баг')
            ->and($card->customer_id)->toBe($bot->id)
            ->and($card->labels()->pluck('name')->all())->toBe(['3c']);

        $headings = collect($card->description['content'])->where('type', 'heading')
            ->map(fn ($node) => $node['content'][0]['text'])->values()->all();
        expect($headings)->toBe(['Тест-кейс', 'Шаги воспроизведения', 'Ожидаемый результат', 'Фактический результат']);
        expect(collect($card->description['content'])->firstWhere('type', 'orderedList')['content'])->toHaveCount(2);

        $attachment = Attachment::query()->sole();
        expect($attachment->uploaded_by)->toBe($bot->id)
            ->and($attachment->kind)->toBe('image')
            ->and(collect($card->description['content'])->last())
            ->toEqual(['type' => 'image', 'attrs' => ['attachmentId' => $attachment->id, 'alt' => $attachment->name]]);
    });

    it('метку подэтапа переиспользует, без скриншота — без вложения', function () {
        setUpStand();
        setUpBot();
        $args = ['--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'];

        $this->artisan('pm:bug', ['file' => bugJson()] + $args)->assertSuccessful();
        $this->artisan('pm:bug', ['file' => bugJson(['title' => 'Второй', 'steps' => "Шаг 1\nШаг 2"])] + $args)->assertSuccessful();

        expect(Label::query()->where('name', '3c')->count())->toBe(1)
            ->and(Attachment::query()->count())->toBe(0)
            ->and(Card::query()->count())->toBeGreaterThanOrEqual(4);
    });

    it('метки из labels — только существующие: нет метки — предупреждение, бот метки не заводит', function () {
        setUpStand();
        setUpBot();
        $labelsBefore = Label::query()->count();
        $bug = bugJson(['substage' => null, 'labels' => ['Безопасность', 'Нет такой метки']]);

        expect(Artisan::call('pm:bug', ['file' => $bug, '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local']))
            ->toBe(0);
        $output = Artisan::output();

        $card = Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->sole();
        expect($output)->toContain('Метки «Нет такой метки» на стенде нет')
            // Последняя строка — номер карточки: её читают скрипты (make pm-bug)
            ->and(collect(explode("\n", trim($output)))->last())->toBe($card->key())
            ->and($card->labels()->pluck('name')->all())->toBe(['безопасность'])
            ->and(Label::query()->count())->toBe($labelsBefore);
    });

    it('метка подэтапа и labels вместе', function () {
        setUpStand();
        setUpBot();

        $this->artisan('pm:bug', [
            'file' => bugJson(['labels' => ['безопасность']]),
            '--owner' => 'pm@selen.test',
            '--bot' => 'qa-bot@selen.local',
        ])->assertSuccessful();

        $card = Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->sole();
        expect($card->labels()->pluck('name')->sort()->values()->all())->toBe(['3c', 'безопасность']);
    });

    it('проверяет JSON и скриншот', function (array $override, string $error) {
        setUpStand();
        setUpBot();

        $this->artisan('pm:bug', ['file' => bugJson($override), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain($error)
            ->assertFailed();

        expect(bugsBoardCards())->toBe([]);
    })->with([
        'подэтап' => [['substage' => 'этап 3'], 'substage'],
        'нет ни подэтапа, ни меток' => [['substage' => null], 'Нужна метка'],
        'метки не списком' => [['substage' => null, 'labels' => ['a' => 'безопасность']], 'labels'],
        'пустой список меток' => [['substage' => null, 'labels' => []], 'Нужна метка'],
        'шаги' => [['steps' => []], 'steps'],
        'нет скриншота' => [['screenshot' => 'missing.png'], 'Скриншот'],
        'скриншот не картинка' => [['screenshot' => __FILE__], 'Скриншот'],
    ]);

    it('владелец LATER из .env деактивирован — подсказка указать актуального, а не заводить учётную запись', function () {
        $owner = setUpStand();
        setUpBot();
        $owner->forceFill(['status' => UserStatus::Deactivated])->save();

        $this->artisan('pm:bug', ['file' => bugJson(), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('pm@selen.test деактивирован — владелец LATER в .env стенда устарел')
            ->assertFailed();
        expect(bugsBoardCards())->toBe([]);
    });

    it('без QA-бота — подсказка про make pm-qa-bot', function () {
        setUpStand();

        $this->artisan('pm:bug', ['file' => bugJson(), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('make pm-qa-bot')
            ->assertFailed();
    });

    it('переводит баг между колонками от имени QA-бота', function () {
        setUpStand();
        $bot = setUpBot();
        $this->artisan('pm:bug', ['file' => bugJson(), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local']);
        $key = Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->sole()->key();

        $this->artisan('pm:bug-move', ['card' => strtolower($key), 'column' => 'исправлено', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('«Исправлено»')
            ->assertSuccessful();

        expect(bugsBoardCards())->toBe([['Кнопка «Архив карточек» уезжает', 'Исправлено']]);
        // На доске багов автоназначения нет: бот, переводящий баг, не становится ответственным
        $this->artisan('pm:bug-move', ['card' => $key, 'column' => 'Исправляется', '--bot' => 'qa-bot@selen.local']);
        expect(Card::query()->where('number', (int) explode('-', $key)[1])->sole()->responsible_id)->toBeNull();
        expect(DB::table('card_transitions')->latest('id')->value('actor_id'))->toBe($bot->id);
    });

    it('pm:bug-move: доработка с «Бэклога» — по колонкам своей доски (Взято в работу → Сделано)', function () {
        setUpStand();
        setUpBot();
        $timer = Card::query()->where('title', 'Таймер')->sole();

        $this->artisan('pm:bug-move', ['card' => $timer->key(), 'column' => 'Взято в работу', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('«Взято в работу»')
            ->assertSuccessful();
        $this->artisan('pm:bug-move', ['card' => $timer->key(), 'column' => 'Сделано', '--bot' => 'qa-bot@selen.local'])
            ->assertSuccessful();
        expect($timer->fresh()->column->name)->toBe('Сделано');

        // Колонки чужой доски не подходят: у «Бэклога» нет «Исправлено»
        $this->artisan('pm:bug-move', ['card' => $timer->key(), 'column' => 'Исправлено', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('На доске «Бэклог» нет колонки «Исправлено»')
            ->assertFailed();
    });

    it('pm:bug-move: неизвестная колонка, карточка не из LATER, нет прав', function () {
        $owner = setUpStand();
        $bot = setUpBot();
        $this->artisan('pm:bug', ['file' => bugJson(), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local']);
        $bug = Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->sole();
        $foreign = makeCard(makeBoard(space(['key' => 'DEV']), admin()), 'To Do', admin());

        $this->artisan('pm:bug-move', ['card' => $bug->key(), 'column' => 'Потом', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('Есть: Новый, Исправляется, Исправлено, Не баг — решение PM')
            ->assertFailed();
        $this->artisan('pm:bug-move', ['card' => $foreign->key(), 'column' => 'Done', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('В пространстве LATER нет карточки')
            ->assertFailed();

        // Бот без доступа к LATER (PM исключил его) — переводить не может
        app(RemoveSpaceMemberAction::class)->handle($owner, PmStand::requireSpace(), $bot);
        $this->artisan('pm:bug-move', ['card' => $bug->key(), 'column' => 'Исправлено', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('Нет прав')
            ->assertFailed();
        expect($bug->fresh()->column->name)->toBe('Новый');
    });
});

describe('pm:bug-show, pm:bugs-list, pm:bug-comment', function () {
    beforeEach(fn () => Storage::fake('attachments'));

    function reportBug(array $override = []): Card
    {
        test()->artisan('pm:bug', ['file' => bugJson($override), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->assertSuccessful();

        return Card::query()->whereHas('board', fn ($q) => $q->where('name', 'Баги приёмки'))->latest('number')->firstOrFail();
    }

    it('pm:bug-show — карточка целиком, комментарии с упоминаниями, вложения сохраняются в каталог', function () {
        $owner = setUpStand();
        $bot = setUpBot();
        $bug = reportBug(['screenshot' => standFile(PNG_1X1, 'png')]);
        app(AddCommentAction::class)->handle($owner, $bug, richText('Посмотри, ', ['mention' => $bot->id]));
        $dir = sys_get_temp_dir().'/pm-files-'.uniqid();

        $this->artisan('pm:bug-show', ['card' => strtolower($bug->key()), '--bot' => 'qa-bot@selen.local', '--files' => $dir])
            ->expectsOutputToContain("{$bug->key()} · Баг · «Баги приёмки» / «Новый»")
            ->expectsOutputToContain('Метки: 3c')
            ->expectsOutputToContain('### Шаги воспроизведения')
            ->expectsOutputToContain('Комментарии (1):')
            ->expectsOutputToContain('Посмотри, @QA-бот')
            ->expectsOutputToContain('Вложения (1):')
            ->expectsOutputToContain('  1-pm-')
            ->assertSuccessful();

        $files = glob("{$dir}/1-*.png");
        expect($files)->toHaveCount(1)
            ->and(file_get_contents($files[0]))->toBe(PNG_1X1);

        // Имя снимка экрана macOS с неразрывными пробелами сохраняется с обычными
        Attachment::query()->update(['name' => "Снимок\u{00A0}экрана\u{202F}в 09.56.png"]);
        $this->artisan('pm:bug-show', ['card' => $bug->key(), '--bot' => 'qa-bot@selen.local', '--files' => $dir])
            ->assertSuccessful();
        expect(is_file("{$dir}/1-Снимок экрана в 09.56.png"))->toBeTrue();
    });

    it('pm:bug-show — только карточки LATER, которые видит бот', function () {
        setUpStand();
        setUpBot();
        $other = space(['key' => 'DEV']);
        $card = makeCard(makeBoard($other, admin()), 'To Do', admin());

        $this->artisan('pm:bug-show', ['card' => $card->key(), '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain("В пространстве LATER нет карточки {$card->key()}")
            ->assertFailed();
    });

    it('pm:bugs-list — баги колонки «Новый» с метками; архивные и из других колонок — нет', function () {
        setUpStand();
        setUpBot();
        $first = reportBug(['title' => 'Первый баг']);
        $fixed = reportBug(['title' => 'Исправленный баг']);
        $archived = reportBug(['title' => 'Архивный баг']);
        $this->artisan('pm:bug-move', ['card' => $fixed->key(), 'column' => 'Исправлено', '--bot' => 'qa-bot@selen.local']);
        $archived->forceFill(['archived_at' => now()])->save();

        $this->artisan('pm:bugs-list', ['--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('«Новый» — 1:')
            ->expectsOutputToContain("{$first->key()}")
            ->doesntExpectOutputToContain('Исправленный баг')
            ->doesntExpectOutputToContain('Архивный баг')
            ->assertSuccessful();

        $this->artisan('pm:bugs-list', ['--bot' => 'qa-bot@selen.local', '--column' => 'Исправляется'])
            ->expectsOutputToContain('В колонке «Исправляется» багов нет.')
            ->assertSuccessful();
    });

    it('pm:bug-comment — комментарий от QA-бота из текста или файла с разметкой', function () {
        setUpStand();
        $bot = setUpBot();
        $bug = reportBug();

        $this->artisan('pm:bug-comment', ['card' => $bug->key(), '--bot' => 'qa-bot@selen.local', '--text' => 'Взято в работу'])
            ->expectsOutputToContain("Комментарий добавлен к {$bug->key()}")
            ->assertSuccessful();
        $file = standFile("## Причина\nСдвиг раскладки.\n\n1. Исправлено\n- PR: https://github.com/luvu1uvu/selen/pull/14", 'md');
        $this->artisan('pm:bug-comment', ['card' => $bug->key(), '--bot' => 'qa-bot@selen.local', '--file' => $file])
            ->assertSuccessful();

        $comments = Comment::query()->where('card_id', $bug->id)->orderBy('created_at')->orderBy('id')->get();
        expect($comments)->toHaveCount(2)
            ->and($comments->pluck('author_id')->unique()->all())->toBe([$bot->id])
            ->and($comments[0]->body)->toEqual(richText('Взято в работу'))
            ->and(array_column($comments[1]->body['content'], 'type'))->toBe(['heading', 'paragraph', 'orderedList', 'bulletList']);
    });

    it('pm:bug-comment — пустой текст, нет файла, бот без доступа', function () {
        $owner = setUpStand();
        $bot = setUpBot();
        $bug = reportBug();
        $args = ['card' => $bug->key(), '--bot' => 'qa-bot@selen.local'];

        $this->artisan('pm:bug-comment', $args + ['--text' => '  '])->expectsOutputToContain('Пустой комментарий')->assertFailed();
        $this->artisan('pm:bug-comment', $args + ['--file' => '/nope.md'])->expectsOutputToContain('Нет файла')->assertFailed();
        app(RemoveSpaceMemberAction::class)->handle($owner, PmStand::requireSpace(), $bot);
        $this->artisan('pm:bug-comment', $args + ['--text' => 'Текст'])->expectsOutputToContain('Нет прав')->assertFailed();

        expect(Comment::query()->count())->toBe(0);
    });
});

describe('pm:task', function () {
    $taskJson = fn (array $override = []) => standFile(json_encode($override + [
        'title' => 'Подэтап 3c — роль «Владелец»',
        'description' => "## Что делаем\n- роль Владельца\n- передача владения",
        'substage' => '3c',
    ], JSON_UNESCAPED_UNICODE), 'json');

    it('заводит работу на «Бэклоге» в «Взято в работу» от имени QA-бота, с меткой подэтапа', function () use ($taskJson) {
        setUpStand();
        $bot = setUpBot();

        $this->artisan('pm:task', ['file' => $taskJson(), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('Взято в работу')
            ->expectsOutputToContain('LATER-')
            ->assertSuccessful();

        $card = Card::query()->where('title', 'Подэтап 3c — роль «Владелец»')->sole();
        expect($card->board->name)->toBe('Бэклог')
            ->and($card->column->name)->toBe('Взято в работу')
            ->and($card->customer_id)->toBe($bot->id)
            ->and($card->labels()->pluck('name')->all())->toBe(['3c'])
            ->and(collect($card->description['content'])->pluck('type')->all())->toBe(['heading', 'bulletList']);
    });

    it('повторный запуск не дублирует карточку; без подэтапа — без метки', function () use ($taskJson) {
        setUpStand();
        setUpBot();
        $args = ['--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'];

        $this->artisan('pm:task', ['file' => $taskJson(['substage' => null, 'title' => 'Хотфикс'])] + $args)->assertSuccessful();
        $this->artisan('pm:task', ['file' => $taskJson(['substage' => null, 'title' => 'Хотфикс'])] + $args)
            ->expectsOutputToContain('уже есть')
            ->assertSuccessful();

        $card = Card::query()->where('title', 'Хотфикс')->sole();
        expect($card->labels()->count())->toBe(0);
    });

    it('проверяет файл: без названия и описания — понятная ошибка', function () use ($taskJson) {
        setUpStand();
        setUpBot();

        $this->artisan('pm:task', ['file' => standFile('{}', 'json'), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->assertFailed();
        $this->artisan('pm:task', ['file' => $taskJson(['substage' => 'третий']), '--owner' => 'pm@selen.test', '--bot' => 'qa-bot@selen.local'])
            ->expectsOutputToContain('substage — номер подэтапа')
            ->assertFailed();
    });
});
