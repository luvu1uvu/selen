<?php

namespace Database\Seeders;

use App\Actions\Attachments\UploadAttachmentAction;
use App\Actions\Boards\CreateBoardAction;
use App\Actions\Boards\MoveBoardAction;
use App\Actions\CardBlocks\BlockCardAction;
use App\Actions\CardBlocks\UnblockCardAction;
use App\Actions\CardLinks\AddCardLinkAction;
use App\Actions\CardRelations\AddCardRelationAction;
use App\Actions\Cards\AddCardParticipantAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\MoveCardAction;
use App\Actions\Cards\SetCardArchivedAction;
use App\Actions\Cards\SyncCardLabelsAction;
use App\Actions\Cards\UpdateCardAction;
use App\Actions\Checklists\AddChecklistAction;
use App\Actions\Checklists\AddChecklistItemAction;
use App\Actions\Checklists\UpdateChecklistItemAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Comments\AddCommentAction;
use App\Actions\Groups\AddGroupMemberAction;
use App\Actions\Groups\SaveGroupAction;
use App\Actions\Groups\SetGroupArchivedAction;
use App\Actions\Labels\SaveLabelAction;
use App\Actions\Lanes\CreateLaneAction;
use App\Actions\Navigation\CreateFolderAction;
use App\Actions\Navigation\MoveNavNodeAction;
use App\Actions\Navigation\SetFolderArchivedAction;
use App\Actions\Navigation\UpdateNavNodeAction;
use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Spaces\ArchiveSpaceAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Actions\Spaces\GrantSpaceGroupAction;
use App\Actions\Spaces\SetSpaceMemberRestrictionAction;
use App\Enums\BoardTemplate;
use App\Enums\ColumnCategory;
use App\Enums\SpaceRole;
use App\Enums\UserStatus;
use App\Models\AccessGrant;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardType;
use App\Models\Company;
use App\Models\Group;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use App\Services\Cards\CardVisibility;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Date;
use App\Services\Access\CompanyMemberships;

/**
 * Демо-данные досок для локальной разработки (только APP_ENV=local, вызывается из DatabaseSeeder).
 *
 * Пространства DEV, OPS, MKT с разными участниками и ролями; доски из обоих шаблонов; карточки
 * с реалистичной историей перемещений за последние 60 дней (на них проверяются отчёты этапа 5).
 * Доска DEV / «Продукт» — 300 карточек: на ней проверяется отзывчивость интерфейса. Доски DEV стоят рядами (ADR-0019):
 * [«Дежурства» (две колонки), «Широкая доска»], [«Продукт»], [«Инфраструктура»]. Фасады заполнены:
 * метки (общие и пространства), ответственные, сроки, «Срочно», оценки, чек-листы, комментарии
 * с упоминаниями, ссылки и картинки-вложения. zhanna@selen.test — editor DEV
 * в режиме «только свои карточки» (видит около десятка карточек).
 *
 * Всё создаётся через настоящие Actions, а время двигается Date::setTestNow(): так переходы
 * в card_transitions, first_started_at/completed_at и журнал событий согласованы так же,
 * как при реальной работе. Случайность детерминирована (mt_srand) — данные одинаковы при каждом make fresh.
 */
class BoardsDemoSeeder extends Seeder
{
    private const DAYS = 60;

    private CarbonImmutable $now;

    /** @var array<string, User> */
    private array $people = [];

    /** @var array<string, string> название типа → id */
    private array $types = [];

    public function run(): void
    {
        mt_srand(2026);
        $this->now = CarbonImmutable::now('UTC')->startOfMinute();
        $this->types = CardType::query()->inCompany(Company::primary())->pluck('id', 'name')->all();
        $this->createPeople();

        // Всё «происходит» 60 дней назад, дальше время идёт вперёд вместе с историей карточек
        $this->travel($this->now->subDays(self::DAYS + 1)->setTime(9, 0));
        [$dev, $ops, $mkt] = $this->createSpaces();

        $product = $this->board($dev, 'Продукт', BoardTemplate::Development, 'anna');
        $urgent = app(CreateLaneAction::class)->handle($this->people['anna'], $product, 'Срочные', null, null);
        // Описание — за значком ⓘ в шапке доски (приёмка LATER-50, ТК-L50.11)
        $infra = $this->board($dev, 'Инфраструктура', BoardTemplate::Simple, 'anna',
            "Серверы, CI и мониторинг.\nСрочное — с флажком «Срочно», плановое — в To Do.");
        $requests = $this->board($ops, 'Заявки', BoardTemplate::Simple, 'egor');
        $planned = app(CreateLaneAction::class)->handle($this->people['egor'], $requests, 'Плановые', null, null);
        $content = $this->board($mkt, 'Контент', BoardTemplate::Simple, 'dina');
        $progress = $this->column($content, 'In Progress');
        foreach (['Текст', 'Дизайн'] as $name) {
            app(CreateColumnAction::class)->handle($this->people['dina'], $content, $name, null, $progress, null, null);
        }
        // Широкая доска без карточек (приёмка LATER-50, поправка PM 19.10): 14 колонок — шире любого экрана, доска
        // занимает всю ширину и прокручивается внутри своего блока; узкая для сравнения — «Инфраструктура» (4 колонки)
        $wide = $this->board($dev, 'Широкая доска', BoardTemplate::Development, 'anna');
        $wideDone = $this->column($wide, 'Done');
        foreach (['Аналитика', 'Дизайн', 'Ревью дизайна', 'Документация', 'Подготовка релиза', 'Мониторинг'] as $name) {
            app(CreateColumnAction::class)->handle($this->people['anna'], $wide, $name, ColumnCategory::InProgress, null, null, $wideDone->id);
        }

        // Узкая доска в две колонки (страница пространства рядами, LATER-55, PR 3): в первом ряду рядом с «Широкой доской»
        $duty = $this->board($dev, 'Дежурства', BoardTemplate::Empty, 'anna');
        $now = app(CreateColumnAction::class)->handle($this->people['anna'], $duty, 'Сейчас', ColumnCategory::InProgress, null, null, null);
        app(CreateColumnAction::class)->handle($this->people['anna'], $duty, 'Готово', ColumnCategory::Done, null, $now->id, null);

        $editorsDev = ['anna', 'boris', 'grigory', 'demo'];
        $this->fill($product, 300, $editorsDev, self::DEV_TITLES, [
            'Backlog', 'To Do', 'In Progress', 'Code Review', 'Ready for Testing', 'Testing', 'Ready for Merge', 'Done',
        ], rework: ['Testing' => 'In Progress'], extraLane: $urgent);
        $this->fill($infra, 25, ['anna', 'grigory'], self::INFRA_TITLES, ['To Do', 'In Progress', 'Review', 'Done']);
        $this->fill($duty, 8, ['anna', 'grigory'], self::INFRA_TITLES, ['Сейчас', 'Готово']);
        $this->fill($requests, 30, ['egor', 'boris'], self::OPS_TITLES, ['To Do', 'In Progress', 'Review', 'Done'], extraLane: $planned);
        $this->fill($content, 25, ['dina', 'vera'], self::MKT_TITLES, ['To Do', 'Текст', 'Дизайн', 'Review', 'Done'], rework: ['Review' => 'Текст']);

        $this->arrangeDev($product, $wide, $duty);
        $this->decorate([$product, $infra, $requests, $content]);
        $this->restrictedContractor($dev, $product);
        $this->groups($dev, $ops, $mkt);
        $this->navigation($dev, $ops, $mkt);
        $this->relationsAndBlocks($product);
        $this->fillContent([$product, $infra, $requests, $content]);

        Date::setTestNow();

        $cards = Card::query()->count();
        $this->command->info("Демо-доски: пространства DEV, OPS, MKT, {$cards} карточек с историей за ".self::DAYS.' дней.');
        $this->command->info('Вход: anna@selen.test (админ DEV), boris@selen.test, admin@selen.test — пароль тот же.');
        $this->command->info('zhanna@selen.test — editor DEV в режиме «только свои карточки».');
        $this->command->info('Группы: «Руководители» (grigory — commenter в OPS и MKT), «Подрядчики» (zhanna — editor «только свои» в OPS), архивная «Стажёры».');
        $this->command->info('Дерево: папки «Продуктовые команды» (DEV) и «Операции» (OPS, MKT); COMP «Компания» открыто группе «Все сотрудники».');
        $this->command->info('Пустая папка «Новые направления» (с вложенной «Идеи на 2027») видна в дереве только Владельцу (owner@selen.test).');
    }

    private function createPeople(): void
    {
        $this->people['owner'] = User::query()->where('email', 'owner@selen.test')->firstOrFail();
        $this->people['admin'] = User::query()->where('email', 'admin@selen.test')->firstOrFail();
        $this->people['demo'] = User::query()->where('email', 'member@selen.test')->firstOrFail();
        $this->people['gone'] = User::query()->where('email', 'deactivated@selen.test')->firstOrFail();

        $team = [
            'anna' => 'Анна Смирнова',
            'boris' => 'Борис Петров',
            'vera' => 'Вера Иванова',
            'grigory' => 'Григорий Орлов',
            'dina' => 'Дина Кузнецова',
            'egor' => 'Егор Соколов',
            'zhanna' => 'Жанна Лебедева',
        ];
        foreach ($team as $login => $name) {
            $this->people[$login] = User::factory()->create(['name' => $name, 'email' => "{$login}@selen.test"]);
        }
    }

    /** @return array{Space, Space, Space} */
    private function createSpaces(): array
    {
        $create = app(CreateSpaceAction::class);
        $add = app(AddSpaceMemberAction::class);
        $admin = $this->people['admin'];

        $dev = $create->handle($admin, Company::primary(), ['name' => 'Разработка', 'key' => 'DEV', 'description' => 'Продукт и инфраструктура'], [$this->people['anna'], $admin, $this->people['owner']]);
        $ops = $create->handle($admin, Company::primary(), ['name' => 'Эксплуатация', 'key' => 'OPS', 'description' => 'Заявки и дежурства'], [$this->people['egor']]);
        $mkt = $create->handle($admin, Company::primary(), ['name' => 'Маркетинг', 'key' => 'MKT', 'description' => null], [$this->people['dina']]);

        // Участников добавляют администраторы пространств
        $owners = ['DEV' => 'anna', 'OPS' => 'egor', 'MKT' => 'dina'];

        // member@selen.test — только в DEV (в OPS и MKT доступа нет); деактивированный остаётся в списке
        foreach ([
            [$dev, 'boris', SpaceRole::Editor], [$dev, 'grigory', SpaceRole::Editor],
            [$dev, 'demo', SpaceRole::Editor], [$dev, 'vera', SpaceRole::Commenter],
            [$dev, 'gone', SpaceRole::Editor], [$dev, 'zhanna', SpaceRole::Editor],
            [$ops, 'boris', SpaceRole::Editor], [$ops, 'anna', SpaceRole::Commenter],
            [$mkt, 'vera', SpaceRole::Editor], [$mkt, 'anna', SpaceRole::Commenter],
        ] as [$space, $login, $role]) {
            $user = $this->people[$login];
            $owner = $this->people[$owners[$space->key]];
            if ($login === 'gone') {
                // Деактивированного добавить нельзя — в демо он «был добавлен до увольнения» (П2c: и убран из компании)
                $memberships = app(CompanyMemberships::class);
                $user->forceFill(['status' => 'active'])->save();
                $memberships->reactivateHome(Company::primary(), $user);
                $add->handle($owner, $space, $user, $role);
                $memberships->deactivateHome(Company::primary(), $user);
                $user->forceFill(['status' => 'deactivated'])->save();

                continue;
            }
            $add->handle($owner, $space, $user, $role);
        }

        return [$dev, $ops, $mkt];
    }

    private function board(Space $space, string $name, BoardTemplate $template, string $owner, ?string $description = null): Board
    {
        return app(CreateBoardAction::class)->handle($this->people[$owner], $space, ['name' => $name, 'description' => $description], $template);
    }

    /**
     * Ряды досок DEV (страница пространства, ADR-0019): первый ряд — узкая «Дежурства» и «Широкая доска» (узкая —
     * по своим колонкам, широкая — остаток ряда, прокрутка вбок внутри блока), дальше по одной в ряду — «Продукт»
     * и «Инфраструктура».
     */
    private function arrangeDev(Board $product, Board $wide, Board $duty): void
    {
        $move = app(MoveBoardAction::class);
        $duty = $move->handle($this->people['anna'], $duty, null, null, newRow: true, newRowBeforeId: $product->row_id);
        $move->handle($this->people['anna'], $wide, $duty->id, null, rowId: $duty->row_id);
    }

    private function column(Board $board, string $name): BoardColumn
    {
        return BoardColumn::query()->where('board_id', $board->id)->where('name', $name)->whereNull('archived_at')->sole();
    }

    /**
     * Наполнить доску карточками: каждая создаётся в случайный момент последних 60 дней и проходит
     * часть пути по колонкам. Старые карточки чаще успевают дойти до конца.
     *
     * @param  list<string>  $editors
     * @param  list<string>  $titles
     * @param  list<string>  $path  листовые колонки по порядку процесса
     * @param  array<string, string>  $rework  «из колонки → вернуть в колонку» (возвраты на доработку)
     */
    private function fill(Board $board, int $count, array $editors, array $titles, array $path, array $rework = [], ?Lane $extraLane = null): void
    {
        $columns = array_combine($path, array_map(fn (string $name) => $this->column($board, $name), $path));
        $mainLane = Lane::query()->where('board_id', $board->id)->orderBy('position')->firstOrFail();
        $lastStep = count($path) - 1;

        // Моменты создания — по возрастанию: так время в сидере всегда идёт вперёд
        $births = [];
        for ($i = 0; $i < $count; $i++) {
            $births[] = $this->now->subMinutes(mt_rand(30, self::DAYS * 24 * 60));
        }
        sort($births);

        $plans = [];
        foreach ($births as $i => $born) {
            $actor = $this->people[$editors[mt_rand(0, count($editors) - 1)]];
            $start = mt_rand(0, 100) < 70 ? 0 : min(1, $lastStep);
            $ageDays = $born->diffInDays($this->now);
            // Чем старше карточка, тем дальше она продвинулась
            $target = min($lastStep, (int) round($ageDays / self::DAYS * $lastStep * 1.6 + mt_rand(-2, 1)));
            $plans[] = [
                'born' => $born,
                'actor' => $actor,
                'title' => $titles[$i % count($titles)].($i >= count($titles) ? ' — часть '.intdiv($i, count($titles)) + 1 : ''),
                'type' => $this->randomType(),
                'lane' => $extraLane !== null && mt_rand(0, 100) < 12 ? $extraLane : $mainLane,
                'start' => $start,
                'target' => max($start, $target),
            ];
        }

        // Шаги всех карточек выполняются в хронологическом порядке
        $steps = [];
        foreach ($plans as $n => $plan) {
            $steps[] = [$plan['born'], $n, 'create', null];
            $at = $plan['born'];
            $reworked = false;
            $reached = $plan['start'];
            for ($step = $plan['start'] + 1; $step <= $plan['target']; $step++) {
                $at = $at->addMinutes($this->stepMinutes($path[$step - 1]));
                if ($at->greaterThanOrEqualTo($this->now)) {
                    break;
                }
                $steps[] = [$at, $n, 'move', $path[$step]];
                $reached = $step;

                // Иногда работу возвращают на доработку и проходят этап заново
                $from = $path[$step];
                if (! $reworked && isset($rework[$from]) && mt_rand(0, 100) < 15) {
                    $reworked = true;
                    $at = $at->addMinutes($this->stepMinutes($from));
                    if ($at->greaterThanOrEqualTo($this->now)) {
                        break;
                    }
                    $steps[] = [$at, $n, 'move', $rework[$from]];
                    $step = $reached = (int) array_search($rework[$from], $path, true);
                }
            }
            // Немногие завершённые карточки открывают заново и завершают повторно
            if ($reached === $lastStep && mt_rand(0, 100) < 6) {
                $reopenAt = $at->addHours(mt_rand(4, 48));
                $doneAgain = $reopenAt->addHours(mt_rand(3, 30));
                if ($doneAgain->lessThan($this->now)) {
                    $steps[] = [$reopenAt, $n, 'move', $path[$lastStep - 1]];
                    $steps[] = [$doneAgain, $n, 'move', $path[$lastStep]];
                }
            }
        }
        usort($steps, fn (array $a, array $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);

        $cards = [];
        $create = app(CreateCardAction::class);
        $move = app(MoveCardAction::class);
        foreach ($steps as [$at, $n, $kind, $columnName]) {
            $plan = $plans[$n];
            $this->travel($at);
            if ($kind === 'create') {
                $cards[$n] = $create->handle($plan['actor'], $board, [
                    'title' => $plan['title'],
                    'card_type_id' => $plan['type'],
                ], $columns[$path[$plan['start']]], $plan['lane']);

                continue;
            }
            $cards[$n] = $move->handle($plan['actor'], $cards[$n], $columns[$columnName], $plan['lane'], null, null);
        }

        // Пара самых старых карточек — в архиве
        $this->travel($this->now);
        $archive = app(SetCardArchivedAction::class);
        foreach (array_slice(array_keys($cards), 0, 2) as $n) {
            $archive->handle($plans[$n]['actor'], $cards[$n], true);
        }
    }

    /**
     * Фасады карточек: метки, сроки (часть — просрочена или завершена после срока), «Срочно», оценки.
     * Через настоящие Actions от имени заказчика — журнал событий согласован с данными.
     *
     * @param  list<Board>  $boards
     */
    private function decorate(array $boards): void
    {
        $this->travel($this->now);
        $admin = $this->people['admin'];
        $saveLabel = app(SaveLabelAction::class);
        $company = [];
        foreach (['Безопасность' => '#ef4444', 'Техдолг' => '#64748b', 'Клиент' => '#f59e0b'] as $name => $color) {
            $company[] = $saveLabel->handle($admin, ['name' => $name, 'color' => $color], company: Company::primary());
        }
        $dev = $boards[0]->space;
        $local = [];
        foreach (['Фронтенд' => '#3b82f6', 'Бэкенд' => '#22c55e', 'Мобильное' => '#a855f7'] as $name => $color) {
            $local[] = $saveLabel->handle($this->people['anna'], ['name' => $name, 'color' => $color], space: $dev);
        }

        $update = app(UpdateCardAction::class);
        $syncLabels = app(SyncCardLabelsAction::class);
        foreach ($boards as $board) {
            $labels = $board->space_id === $dev->id ? [...$company, ...$local] : $company;
            $cards = Card::query()->active()->where('board_id', $board->id)->orderBy('number')->with('customer', 'space', 'lane')->get();
            foreach ($cards as $card) {
                $actor = $card->customer;
                if (mt_rand(0, 100) < 55) {
                    $picked = array_rand($labels, mt_rand(1, 2));
                    $syncLabels->handle($actor, $card, array_map(fn (int $i) => $labels[$i]->id, (array) $picked));
                }

                $fields = [];
                if (mt_rand(0, 100) < 35) {
                    $due = CarbonImmutable::instance($card->created_at)->addDays(mt_rand(2, 25));
                    $fields += mt_rand(0, 100) < 30
                        ? ['due_at' => $due->setTime(mt_rand(9, 18), 0)->toIso8601String()]
                        : ['due_date' => $due->toDateString()];
                }
                if (mt_rand(0, 100) < ($card->lane->name === 'Срочные' ? 70 : 6)) {
                    $fields['is_urgent'] = true;
                }
                if (mt_rand(0, 100) < 50) {
                    $fields['estimate_hours'] = [1, 1.5, 2, 3, 4, 6, 8, 12, 16][mt_rand(0, 8)];
                }
                if ($fields !== []) {
                    $update->handle($actor, $card, $fields);
                }
            }
        }
    }

    /**
     * Содержимое карточек: чек-листы (часть пунктов выполнена), комментарии с упоминаниями, ссылки и
     * немного картинок-вложений — чтобы на фасадах были прогресс и счётчики. Через настоящие Actions.
     *
     * @param  list<Board>  $boards
     */
    private function fillContent(array $boards): void
    {
        $this->travel($this->now);
        $addChecklist = app(AddChecklistAction::class);
        $addItem = app(AddChecklistItemAction::class);
        $updateItem = app(UpdateChecklistItemAction::class);
        $comment = app(AddCommentAction::class);
        $link = app(AddCardLinkAction::class);
        $upload = app(UploadAttachmentAction::class);
        $visibility = app(CardVisibility::class);
        $png = tempnam(sys_get_temp_dir(), 'demo');
        file_put_contents($png, base64_decode(self::DEMO_PNG));

        foreach ($boards as $board) {
            $members = AccessGrant::query()->onSpace($board->space_id)->whereNotNull('user_id')->orderBy('id')->with('user')->get()
                ->map(fn (AccessGrant $grant) => $grant->user)
                ->filter(fn (User $u) => $u->status === UserStatus::Active)
                ->values();
            $cards = Card::query()->active()->where('board_id', $board->id)->orderBy('number')->with(['customer', 'space'])->get();

            foreach ($cards as $card) {
                // Писать и быть упомянутым может только тот, кто видит карточку (поправка A)
                $audience = $members->filter(fn (User $u) => $visibility->canSee($u, $card))->values();
                $author = $audience[mt_rand(0, $audience->count() - 1)];
                $editor = $card->customer;

                if (mt_rand(0, 100) < 30) {
                    $checklist = $addChecklist->handle($editor, $card, self::CHECKLISTS[mt_rand(0, count(self::CHECKLISTS) - 1)]);
                    $total = mt_rand(2, 6);
                    $done = $card->completed_at !== null ? $total : mt_rand(0, $total);
                    for ($i = 0; $i < $total; $i++) {
                        $item = $addItem->handle($editor, $checklist, self::CHECKLIST_ITEMS[($card->number + $i) % count(self::CHECKLIST_ITEMS)]);
                        if ($i < $done) {
                            $updateItem->handle($editor, $item, ['is_done' => true]);
                        }
                    }
                }

                if (mt_rand(0, 100) < 25) {
                    for ($i = mt_rand(1, 3); $i > 0; $i--) {
                        $mentioned = $audience[mt_rand(0, $audience->count() - 1)];
                        $text = self::COMMENTS[mt_rand(0, count(self::COMMENTS) - 1)];
                        $body = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [
                            ['type' => 'text', 'text' => $text.' '],
                            ['type' => 'mention', 'attrs' => ['id' => $mentioned->id]],
                        ]]]];
                        $comment->handle($author, $card, $body);
                    }
                }

                if (mt_rand(0, 100) < 10) {
                    $link->handle($editor, $card, ['url' => 'https://figma.example.ru/file/'.$card->number, 'title' => 'Макет']);
                }

                if (mt_rand(0, 100) < 5) {
                    $upload->handle($author, $card, new UploadedFile($png, 'скриншот-'.$card->number.'.png', 'image/png', null, true));
                }
            }
        }

        @unlink($png);
    }

    /**
     * Связи и блокировки на доске «Продукт»: несколько эпиков с дочерними, активные блокировки (текстом
     * и карточкой) и снятые — для истории. Одна карточка подрядчика заблокирована карточкой, которую
     * он не видит («Скрытая карточка»).
     */
    private function relationsAndBlocks(Board $product): void
    {
        $this->travel($this->now->subDays(2));
        $anna = $this->people['anna'];
        $relate = app(AddCardRelationAction::class);
        $block = app(BlockCardAction::class);
        $unblock = app(UnblockCardAction::class);
        $visibility = app(CardVisibility::class);

        $cards = Card::query()->active()->where('board_id', $product->id)->orderBy('number')->with('space')->get();
        $open = $cards->filter(fn (Card $card) => $card->completed_at === null)->values();

        // Эпики — по 3–5 дочерних (часть уже готова — виден прогресс)
        $epics = collect([0, 7, 14, 21, 28])->map(fn (int $i) => $open[$i]);
        $pool = $cards->reject(fn (Card $card) => $epics->contains('id', $card->id))->values();
        foreach ($epics as $i => $epic) {
            foreach ($pool->slice(40 + $i * 12, mt_rand(3, 5)) as $child) {
                $relate->handle($anna, $epic, $child, AddCardRelationAction::KIND_CHILD);
            }
        }

        // Активные блокировки: через одну — текстом и карточкой; блокирующая — незавершённая
        foreach ($open->slice(60, 16)->values() as $i => $card) {
            $blocker = $i % 2 === 0 ? $open[100 + $i] : null;
            $block->handle($anna, $card, $blocker === null ? self::BLOCK_REASONS[$i % count(self::BLOCK_REASONS)] : null, $blocker !== null, $blocker);
        }

        // Снятые блокировки — история эпизодов
        $this->travel($this->now->subDays(5));
        foreach ($open->slice(120, 6) as $card) {
            $episode = $block->handle($anna, $card, self::BLOCK_REASONS[$card->number % count(self::BLOCK_REASONS)], false, null);
            $this->travel($this->now->subDays(4));
            $unblock->handle($this->people['boris'], $episode);
            $this->travel($this->now->subDays(5));
        }

        // Карточка подрядчика ждёт карточку, которой он не видит
        $zhanna = $this->people['zhanna'];
        $own = $open->first(fn (Card $card) => $card->involves($zhanna) && ! $card->blocks()->active()->exists());
        $hidden = $open->first(fn (Card $card) => ! $visibility->canSee($zhanna, $card) && $card->id !== $own?->id);
        if ($own !== null && $hidden !== null) {
            $this->travel($this->now->subDay());
            $block->handle($anna, $own, 'Ждём решение по архитектуре', true, $hidden);
        }
    }

    /** Подрядчик в режиме «только свои карточки»: ответственный или участник около десятка карточек. */
    private function restrictedContractor(Space $dev, Board $product): void
    {
        $zhanna = $this->people['zhanna'];
        $anna = $this->people['anna'];
        app(SetSpaceMemberRestrictionAction::class)->handle($anna, $dev, $zhanna, true);

        $cards = Card::query()->active()->where('board_id', $product->id)->orderBy('number')->get()
            ->filter(fn (Card $card, int $i) => $i % 29 === 3)->take(10)->values();
        foreach ($cards as $i => $card) {
            $i % 2 === 0
                ? app(UpdateCardAction::class)->handle($anna, $card, ['responsible_id' => $zhanna->id])
                : app(AddCardParticipantAction::class)->handle($anna, $card, $zhanna);
        }
    }

    /**
     * Группы пользователей (ADR-0012): доступ через группу рядом с личным участием.
     * Архивная группа доступа не даёт — видна в админке на странице пользователя как недействующий источник.
     */
    private function groups(Space $dev, Space $ops, Space $mkt): void
    {
        $admin = $this->people['admin'];
        $save = app(SaveGroupAction::class);
        $addMember = app(AddGroupMemberAction::class);
        $grant = app(GrantSpaceGroupAction::class);

        $leads = $save->handle($admin, Company::primary(), ['name' => 'Руководители', 'description' => 'Видят все продуктовые пространства']);
        $addMember->handle($admin, $leads, $this->people['grigory']);
        $addMember->handle($admin, $leads, $this->people['anna']);
        foreach ([$dev, $ops, $mkt] as $space) {
            $grant->handle($admin, $space, $leads, SpaceRole::Commenter);
        }

        $contractors = $save->handle($admin, Company::primary(), ['name' => 'Подрядчики', 'description' => 'Внешние исполнители заявок']);
        $addMember->handle($admin, $contractors, $this->people['zhanna']);
        $grant->handle($admin, $ops, $contractors, SpaceRole::Editor, ownCardsOnly: true);

        $interns = $save->handle($admin, Company::primary(), ['name' => 'Стажёры', 'description' => 'Летняя стажировка']);
        $addMember->handle($admin, $interns, $this->people['demo']);
        $grant->handle($admin, $mkt, $interns, SpaceRole::Commenter);
        app(SetGroupArchivedAction::class)->handle($admin, $interns, true);
    }

    /**
     * Дерево навигации (ADR-0013): папки с иконками и пространство «Компания», открытое встроенной группе
     * «Все сотрудники» (значок «доступно всем»). Архивная папка с архивным пространством — для «Структуры».
     */
    private function navigation(Space $dev, Space $ops, Space $mkt): void
    {
        $admin = $this->people['admin'];
        $folder = app(CreateFolderAction::class);
        $update = app(UpdateNavNodeAction::class);
        $move = app(MoveNavNodeAction::class);

        $company = app(CreateSpaceAction::class)->handle(
            $admin,
            Company::primary(),
            ['name' => 'Компания', 'key' => 'COMP', 'description' => 'Объявления и общие правила — открыто всем сотрудникам'],
            [$admin],
            '🏢',
        );
        $this->board($company, 'Объявления', BoardTemplate::Simple, 'admin');
        app(GrantSpaceGroupAction::class)->handle($admin, $company, Group::everyone(Company::primary()), SpaceRole::Commenter);

        // Не «Продукт»: так называется доска в DEV — одинаковые названия папки и доски путают в дереве
        $product = $folder->handle($admin, Company::primary(), 'Продуктовые команды', '💡', null);
        $operations = $folder->handle($admin, Company::primary(), 'Операции', '⚙️', null);
        // По-настоящему пустая папка (ни одного пространства на любой глубине) — в дереве её видит только Владелец
        $ideas = $folder->handle($admin, Company::primary(), 'Новые направления', '🌱', null);
        $folder->handle($admin, Company::primary(), 'Идеи на 2027', null, $ideas->id);
        $old = $folder->handle($admin, Company::primary(), 'Архив 2025', null, $operations->id);

        // Архивное пространство в архивной папке — видно в «Структуре», восстанавливается вместе с папкой
        $promo = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Промо 2025', 'key' => 'PROMO'], [$admin]);
        $move->handle($admin, NavNode::query()->where('space_id', $promo->id)->sole(), $old->id, null, null);
        app(ArchiveSpaceAction::class)->handle($admin, $promo);
        app(SetFolderArchivedAction::class)->handle($admin, $old, true);

        $node = fn (Space $space) => NavNode::query()->where('space_id', $space->id)->sole();
        $move->handle($admin, $node($company), null, null, $product->id);
        $move->handle($admin, $node($dev), $product->id, null, null);
        $move->handle($admin, $node($ops), $operations->id, null, null);
        $move->handle($admin, $node($mkt), $operations->id, null, null);
        foreach ([[$dev, '💻'], [$ops, '🛠️'], [$mkt, '📣']] as [$space, $icon]) {
            $update->handle($admin, $node($space), ['icon' => $icon]);
        }
    }

    /** Сколько карточка пробыла в колонке перед переходом дальше: от получаса до нескольких дней. */
    private function stepMinutes(string $column): int
    {
        $base = match (true) {
            in_array($column, ['Backlog', 'To Do'], true) => [60, 5 * 24 * 60],
            in_array($column, ['Code Review', 'Review', 'Ready for Merge', 'Ready for Testing'], true) => [30, 2 * 24 * 60],
            default => [2 * 60, 4 * 24 * 60],
        };

        return mt_rand(...$base);
    }

    private function randomType(): string
    {
        $roll = mt_rand(1, 100);
        $name = match (true) {
            $roll <= 60 => 'Задача',
            $roll <= 82 => 'Баг',
            $roll <= 96 => 'История',
            default => 'Эпик',
        };

        return $this->types[$name];
    }

    private function travel(CarbonImmutable $at): void
    {
        Date::setTestNow($at);
    }

    /** Картинка-вложение для демо (PNG 1×1). */
    private const DEMO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private const BLOCK_REASONS = [
        'Ждём доступы от заказчика', 'Нет макета', 'Ждём ответа юристов', 'Сервер на обслуживании', 'Нужен ответ поддержки поставщика',
    ];

    private const CHECKLISTS = ['Перед релизом', 'Проверка', 'Подготовка', 'Что сделать'];

    private const CHECKLIST_ITEMS = [
        'Написать тесты', 'Обновить документацию', 'Проверить миграции', 'Согласовать с заказчиком',
        'Ревью кода', 'Проверить на стенде', 'Обновить changelog', 'Сообщить поддержке',
    ];

    private const COMMENTS = [
        'Посмотри, пожалуйста,', 'Есть вопрос по требованиям —', 'Готово к проверке,', 'Нужна помощь,',
        'Обновил описание,', 'Блокирует релиз, подключи',
    ];

    private const DEV_TITLES = [
        'Экспорт отчёта в CSV', 'Ошибка при сохранении профиля', 'Фильтр задач по исполнителю', 'Ускорить загрузку доски',
        'Подсказки при вводе email', 'Тёмная тема интерфейса', 'Падает импорт из Excel', 'Уведомления о дедлайнах',
        'Обновить зависимости backend', 'Логирование ошибок оплаты', 'Пагинация в списке клиентов', 'Двухфакторная аутентификация',
        'Отчёт по продажам за квартал', 'Неверная сортировка по дате', 'Кнопка «Повторить» после ошибки', 'Шаблоны писем клиентам',
        'Поиск по комментариям', 'Кеширование справочников', 'Ограничение частоты запросов API', 'Мобильная вёрстка карточки',
        'Дубли в списке заказов', 'Права доступа к отчётам', 'Миграция на новую версию PHP', 'Автосохранение черновика',
        'История изменений заказа', 'Интеграция с 1С: остатки', 'Ошибка округления в счёте', 'Онбординг новых пользователей',
        'Массовое редактирование задач', 'Документация API v1',
    ];

    private const INFRA_TITLES = [
        'Обновить сертификат TLS', 'Резервная копия на внешний сервер', 'Мониторинг диска на сервере БД', 'Ротация логов nginx',
        'Настроить алерты по 5xx', 'Перенести CI на новые раннеры', 'Обновить PostgreSQL до минорной версии', 'Проверить восстановление из бэкапа',
    ];

    private const OPS_TITLES = [
        'Не работает принтер в бухгалтерии', 'Доступ к VPN для нового сотрудника', 'Заменить ноутбук отдела продаж', 'Настроить почту на телефоне',
        'Выдать права на общую папку', 'Медленный Wi-Fi в переговорной', 'Установить офисный пакет', 'Сбросить пароль от CRM',
        'Подключить монитор', 'Перенос рабочего места',
    ];

    private const MKT_TITLES = [
        'Статья о новом релизе', 'Баннер для конференции', 'Рассылка клиентам за месяц', 'Кейс внедрения у партнёра',
        'Обновить лендинг тарифов', 'Видео-обзор функций', 'Пост в канал компании', 'Презентация для выставки',
    ];
}
