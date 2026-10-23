<?php

namespace Database\Seeders;

use App\Actions\Attachments\UploadAttachmentAction;
use App\Actions\Boards\CreateBoardAction;
use App\Actions\Boards\MoveBoardAction;
use App\Actions\CardBlocks\BlockCardAction;
use App\Actions\Cards\AddCardParticipantAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\MoveCardAction;
use App\Actions\Cards\SetCardArchivedAction;
use App\Actions\Cards\SyncCardLabelsAction;
use App\Actions\Cards\UpdateCardAction;
use App\Actions\Checklists\AddChecklistAction;
use App\Actions\Checklists\AddChecklistItemAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Comments\AddCommentAction;
use App\Actions\Groups\AddGroupMemberAction;
use App\Actions\Groups\SaveGroupAction;
use App\Actions\Groups\SetGroupArchivedAction;
use App\Actions\Labels\SaveLabelAction;
use App\Actions\Lanes\CreateLaneAction;
use App\Actions\Navigation\CreateFolderAction;
use App\Actions\Navigation\MoveNavNodeAction;
use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Actions\Spaces\GrantSpaceGroupAction;
use App\Actions\Spaces\SetSpaceMemberRestrictionAction;
use App\Enums\BoardTemplate;
use App\Enums\ColumnCategory;
use App\Enums\SpaceRole;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Company;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Http\UploadedFile;

/**
 * Данные для E2E-тестов (make e2e): только в изолированном стеке docker-compose.e2e.yml.
 * Пароль у всех — UserFactory::PASSWORD.
 *
 * - e2e-owner@selen.test   — Владелец (ADR-0017), ни в одном пространстве не участвует
 * - e2e-admin@selen.test   — системный администратор и администратор пространства QA
 * - e2e-editor@selen.test  — editor в QA
 * - e2e-outsider@selen.test — без доступа к QA
 * - e2e-restricted@selen.test — editor в QA в режиме «только свои карточки», ответственный за QA-2
 * - e2e-analyst@selen.test — без доступа; группа «E2E Аналитики» (commenter в QA) пуста — тест groups.spec
 *   добавляет его в группу и исключает
 * - e2e-candidate@selen.test — участник без доступа, не входит; ТК-3.26 меняет его системную роль туда и обратно
 * Пространство QA, доска «Процесс» (шаблон «Разработка»), карточки в To Do: QA-1, QA-2 (подрядчика),
 * QA-3 «Блокирующая задача» и QA-4 «Устаревшая задача» (в архиве). Доска шире окна; QA-5 «Релиз со сроком»
 * в предпоследней колонке Ready for Merge — со сроком, т. е. со скрытой подписью для скринридеров (board.spec).
 * «Плотная доска» (шаблон «Простой»): в To Do и In Progress по 8 карточек разной высоты (board.spec, перетаскивание).
 * Пространство LAYOUT «Раскладка» (e2e-editor — editor), доска «Длинная доска» (шаблон «Разработка»): шире и выше
 * окна — 30 карточек в To Do (board-layout.spec: закреплённые шапка и заголовки колонок, прокрутка вбок,
 * автопрокрутка; приёмка LATER-4/LATER-50). Там же для приёмочных тестов PR 1 (acceptance/stage-layout): «Доска
 * переносов» (по 30 карточек в Backlog и To Do — их переносят и добавляют), «Широкая доска» (14 колонок без карточек)
 * и «С описанием» (описание в две строки — ТК-L50.11).
 * «Дорожки» (шаблон «Простой», без карточек): дорожки «Основная» и с длинным названием, у In Progress — подколонки
 * «Разработка» и «Ревью» (add-card.spec — форма «+» в заголовке колонки).
 * В LAYOUT для PR 2 пакета (дорожки внутри доски и их сворачивание, LATER-55): «Доска с дорожками» (lanes.spec)
 * и «Дорожки приёмки» (приёмочные тесты ТК-L55) — шаблон «Разработка» (шире окна), дорожки «Основная» (3 карточки
 * в To Do), «Срочные» (2 в To Do, 1 в In Progress) и «Плановые» (1 в Backlog). «Длинные дорожки» (lanes.spec)
 * и «Длинные дорожки приёмки» (ТК-L55.8) — полосы закреплены при прокрутке вниз: «Основная» и «Срочные» по 20 карточек
 * в To Do (выше окна), «Плановые» — 2.
 *
 * Страница пространства рядами (PR 3 пакета, LATER-55): ROWS «Ряды» (e2e-editor — editor, e2e-restricted — editor
 * «только свои») — ряды [«Узкая» (2 колонки), «Широкая» (8 колонок)], [«Высокая» (40 карточек в To Do — выше окна)],
 * [«Нижняя»], [«Промежуточная»], [«Средняя»], [«Последняя»] (40, 20 и 40 карточек поровну по колонкам); space.spec только
 * смотрит (сворачивание возвращает). ARRANGE «Перестановка» — «Первая», «Вторая»,
 * «Третья» по одной в ряду: их переставляет board-rows.spec (перетаскивание и меню), раскладка меняется по ходу файла.
 * Приёмочные тесты PR 3 (ТК-L55.12–L55.24) — свои пространства RACC, RFOLD, RDRAG, RNEWROW, RKEYS, RARCH, RFOUR, устроенные
 * как «Разработка» демо-данных (acceptanceRows); в RFOUR все четыре доски — в первом ряду.
 *
 * Дерево (tree.spec): папка «E2E Мобильные» с пространством MOB «Мобильные приложения» (доска «Релизы» с карточкой
 * MOB-1, e2e-editor — commenter); QA и MOVE «E2E Перенос» (только администратор) — в корне.
 * Пачка UX-1 (acceptance/stage-ux1): в LAYOUT — «Длинные названия» (ТК-L74.1), в QA — метка «Бэкенд» (ТК-L80.1), MOB-1 —
 * ТК-L76.1 и ТК-L78.1.
 * Пустая папка «E2E Пустая» с вложенной «E2E Вложенная пустая» — в дереве видна только Владельцу (тест-кейсы 3c).
 * Пачка UX-2 (LATER-109, tree-row.spec, acceptance/stage-ux2): в корне — папка с длинным названием, в ней такая же папка,
 * в ней пространство LONGTREE с доской (названия — константы LONG_*; видит только администратор).
 * Приёмка UI-1a (окно карточки, acceptance/stage-ui1): пространство WIN «Окно карточки» — см. cardWindow().
 * Приёмка LATER-91 (подготовка к тёмной теме, acceptance/stage-L91): пространство THEME «Тёмная тема» — см. themePrep().
 * Приёмка «Права 2.0», П2a (acceptance/stage-R2, ТК-R2.1–R2.4): пространства RROLES, RREAD, RGROUPS, RALL, RINTERN,
 * группы «E2E Руководители», «E2E Подрядчики», архивная «E2E Стажёры» — см. rights2().
 * Приёмка пачки UX-2 (окно карточки, уведомления, acceptance/stage-ux2): пространство UXB «Пачка UX-2» — см. uxBatch2().
 */
class E2eSeeder extends Seeder
{
    /** Дорожка с длинным названием на доске «Дорожки» (add-card.spec, LATER-49). */
    public const LONG_LANE = 'Очень длинное название дорожки для проверки многоточия в форме';

    /** Дерево с длинными названиями (пачка UX-2, LATER-109): папка → папка → пространство LONGTREE → доска. */
    public const LONG_FOLDER = 'E2E Папка с очень длинным названием, которое не помещается в дерево';

    public const LONG_SUBFOLDER = 'E2E Вложенная папка с очень длинным названием для многоточия';

    public const LONG_SPACE = 'E2E Пространство с очень длинным названием для проверки многоточия';

    public const LONG_BOARD = 'E2E Доска с очень длинным названием на самом глубоком уровне дерева';

    /** Картинка 1×1 для вложения карточки (пачка UX-2, uxBatch2). */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function run(): void
    {
        User::factory()->owner()->create(['name' => 'E2E Владелец', 'email' => 'e2e-owner@selen.test']);
        $admin = User::factory()->admin()->create(['name' => 'E2E Администратор', 'email' => 'e2e-admin@selen.test']);
        $editor = User::factory()->create(['name' => 'E2E Редактор', 'email' => 'e2e-editor@selen.test']);
        $outsider = User::factory()->create(['name' => 'E2E Посторонний', 'email' => 'e2e-outsider@selen.test']);
        $restricted = User::factory()->create(['name' => 'E2E Подрядчик', 'email' => 'e2e-restricted@selen.test']);
        User::factory()->create(['name' => 'E2E Аналитик', 'email' => 'e2e-analyst@selen.test']);
        // ТК-3.26 (acceptance/stage-3): Владелец назначает его администратором и снимает. Не входит в систему —
        // смена его роли не задевает сохранённые входы других тестов
        $candidate = User::factory()->create(['name' => 'E2E Кандидат', 'email' => 'e2e-candidate@selen.test']);

        $space = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Сквозные тесты', 'key' => 'QA'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $editor, SpaceRole::Editor);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $restricted, SpaceRole::Editor);
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $space, $restricted, true);
        $analysts = app(SaveGroupAction::class)->handle($admin, Company::primary(), ['name' => 'E2E Аналитики']);
        app(GrantSpaceGroupAction::class)->handle($admin, $space, $analysts, SpaceRole::Commenter);

        $board = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Процесс'], BoardTemplate::Development);
        $todo = BoardColumn::query()->where('board_id', $board->id)->where('name', 'To Do')->sole();
        $lane = Lane::query()->where('board_id', $board->id)->sole();

        app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Существующая задача'], $todo, $lane);
        $own = app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Задача подрядчика'], $todo, $lane);
        app(UpdateCardAction::class)->handle($editor, $own, ['responsible_id' => $restricted->id]);
        app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Блокирующая задача'], $todo, $lane);
        $old = app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Устаревшая задача'], $todo, $lane);
        app(SetCardArchivedAction::class)->handle($editor, $old, true);
        $merge = BoardColumn::query()->where('board_id', $board->id)->where('name', 'Ready for Merge')->sole();
        $release = app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Релиз со сроком'], $merge, $lane);
        app(UpdateCardAction::class)->handle($editor, $release, ['due_date' => now()->addWeek()->toDateString()]);

        // Плотная доска (board.spec): в соседних колонках карточки разной высоты со сдвигом. На такой раскладке
        // перетаскивание у границы колонок раньше зацикливалось (Maximum update depth exceeded)
        $dense = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Плотная доска'], BoardTemplate::Simple);
        $denseLane = Lane::query()->where('board_id', $dense->id)->sole();
        foreach (['To Do', 'In Progress'] as $offset => $columnName) {
            $column = BoardColumn::query()->where('board_id', $dense->id)->where('name', $columnName)->sole();
            foreach (range(1, 8) as $i) {
                $title = ($i + $offset) % 2 === 0
                    ? "Короткая {$columnName} {$i}"
                    : "Длинная карточка {$columnName} {$i}: название в несколько строк, чтобы высота отличалась от соседней";
                app(CreateCardAction::class)->handle($editor, $dense, ['title' => $title], $column, $denseLane);
            }
        }

        // Длинная доска (board-layout.spec, приёмка LATER-4/LATER-50): шире окна (8 колонок) и выше его — 30 карточек
        // в To Do; закреплённые шапка и заголовки колонок, прокрутка вбок, автопрокрутка при перетаскивании. Своё
        // пространство: номера карточек не пересекаются с QA (поиск «QA-3» в тестах не находит QA-30…)
        $layout = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Раскладка', 'key' => 'LAYOUT'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $layout, $editor, SpaceRole::Editor);
        $long = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => 'Длинная доска'], BoardTemplate::Development);
        $longLane = Lane::query()->where('board_id', $long->id)->sole();
        $longTodo = BoardColumn::query()->where('board_id', $long->id)->where('name', 'To Do')->sole();
        foreach (range(1, 30) as $i) {
            app(CreateCardAction::class)->handle($editor, $long, ['title' => "Карточка длинной доски {$i}"], $longTodo, $longLane);
        }

        // Приёмка PR 1 пакета «Раскладка» (e2e/acceptance/stage-layout). «Доска переносов» — как доска «Продукт»
        // демо-данных из тест-кейсов: длинные колонки Backlog и To Do рядом, по 30 карточек. Её карточки тесты переносят
        // и добавляют (ТК-L50.4 — перетаскивание из Backlog с автопрокруткой, ТК-L50.5 — перенос с клавиатуры из низа
        // Backlog в To Do на той же высоте, ТК-L50.6 — «+» и «+ Карточка» в To Do): «Длинную доску» board-layout.spec
        // ждёт нетронутой
        $moves = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => 'Доска переносов'], BoardTemplate::Development);
        $movesLane = Lane::query()->where('board_id', $moves->id)->sole();
        foreach (['Backlog' => 'Карточка переноса', 'To Do' => 'Задача колонки To Do'] as $columnName => $title) {
            $column = BoardColumn::query()->where('board_id', $moves->id)->where('name', $columnName)->sole();
            foreach (range(1, 30) as $i) {
                app(CreateCardAction::class)->handle($editor, $moves, ['title' => "{$title} {$i}"], $column, $movesLane);
            }
        }
        // «Широкая доска» (ТК-L50.13): 14 колонок без карточек — шире экрана, но невысокая; прокручивается вбок
        // внутри своего блока, под ней — фон холста (как «Широкая доска» демо-данных)
        $wide = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => 'Широкая доска'], BoardTemplate::Development);
        $wideDone = BoardColumn::query()->where('board_id', $wide->id)->where('name', 'Done')->sole();
        foreach (['Аналитика', 'Дизайн', 'Ревью дизайна', 'Документация', 'Подготовка релиза', 'Мониторинг'] as $name) {
            app(CreateColumnAction::class)->handle($admin, $wide, $name, ColumnCategory::InProgress, null, null, $wideDone->id);
        }

        // «С описанием» (ТК-L50.11): описание в две строки — за значком ⓘ в шапке доски. Поля описания в интерфейсе нет,
        // оно задаётся при создании через API (так описание есть у досок стенда PM)
        app(CreateBoardAction::class)->handle($admin, $layout, [
            'name' => 'С описанием',
            'description' => "Первая строка описания\nВторая строка описания",
        ], BoardTemplate::Simple);

        // Дорожки внутри доски и их личное сворачивание (LATER-55): свои доски у lanes.spec и у приёмочных тестов —
        // сворачивание хранится на сервере, тесты не должны мешать друг другу
        foreach (['Доска с дорожками' => 'Дорожная', 'Дорожки приёмки' => 'Приёмочная'] as $boardName => $prefix) {
            $withLanes = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => $boardName], BoardTemplate::Development);
            $column = fn (string $name) => BoardColumn::query()->where('board_id', $withLanes->id)->where('name', $name)->sole();
            $main = Lane::query()->where('board_id', $withLanes->id)->sole();
            $urgent = app(CreateLaneAction::class)->handle($admin, $withLanes, 'Срочные', null, null);
            $planned = app(CreateLaneAction::class)->handle($admin, $withLanes, 'Плановые', null, null);
            foreach ([
                [$main, 'To Do', 'основная 1'], [$main, 'To Do', 'основная 2'], [$main, 'To Do', 'основная 3'],
                [$urgent, 'To Do', 'срочная 1'], [$urgent, 'To Do', 'срочная 2'], [$urgent, 'In Progress', 'срочная в работе'],
                [$planned, 'Backlog', 'плановая'],
            ] as [$cardLane, $columnName, $title]) {
                app(CreateCardAction::class)->handle($editor, $withLanes, ['title' => "{$prefix} {$title}"], $column($columnName), $cardLane);
            }
        }

        // Полосы дорожек закреплены при прокрутке вниз (замечание PM к PR 2): дорожки выше окна, шире окна — шаблон
        // «Разработка». Свои доски у lanes.spec и у приёмочного теста ТК-L55.8
        foreach (['Длинные дорожки' => 'Длинная', 'Длинные дорожки приёмки' => 'Приёмка длинной'] as $boardName => $prefix) {
            $long = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => $boardName], BoardTemplate::Development);
            $toDo = BoardColumn::query()->where('board_id', $long->id)->where('name', 'To Do')->sole();
            $main = Lane::query()->where('board_id', $long->id)->sole();
            $urgent = app(CreateLaneAction::class)->handle($admin, $long, 'Срочные', null, null);
            $planned = app(CreateLaneAction::class)->handle($admin, $long, 'Плановые', null, null);
            foreach ([[$main, 'основная', 20], [$urgent, 'срочная', 20], [$planned, 'плановая', 2]] as [$cardLane, $title, $count]) {
                foreach (range(1, $count) as $i) {
                    app(CreateCardAction::class)->handle($editor, $long, ['title' => "{$prefix} {$title} {$i}"], $toDo, $cardLane);
                }
            }
        }

        // Пачка UX-1 (acceptance/stage-ux1, ТК-L74.1): «Длинные названия» — колонку Backlog и дорожку «Основная» тест
        // переименовывает через «⋯» в длинные названия и возвращает прежние; вторая дорожка — чтобы были видны полосы
        // дорожек
        $longNames = app(CreateBoardAction::class)->handle($admin, $layout, ['name' => 'Длинные названия'], BoardTemplate::Development);
        app(CreateLaneAction::class)->handle($admin, $longNames, 'Срочные', null, null);
        // ТК-L80.1: метка пространства QA — «⋯» её строки на вкладке «Метки»
        app(SaveLabelAction::class)->handle($admin, ['name' => 'Бэкенд', 'color' => '#22c55e'], space: $space);

        // Форма «+» в заголовке колонки (add-card.spec, LATER-49): две дорожки, у второй — длинное название
        // (многоточие), у In Progress — подколонки
        $lanes = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Дорожки'], BoardTemplate::Simple);
        app(CreateLaneAction::class)->handle($admin, $lanes, self::LONG_LANE, null, null);
        $inProgress = BoardColumn::query()->where('board_id', $lanes->id)->where('name', 'In Progress')->sole();
        app(CreateColumnAction::class)->handle($admin, $lanes, 'Разработка', null, $inProgress, null, null);
        app(CreateColumnAction::class)->handle($admin, $lanes, 'Ревью', null, $inProgress, null, null);

        $this->rows($admin, $editor, $restricted);

        $mobile = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Мобильные приложения', 'key' => 'MOB'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $mobile, $editor, SpaceRole::Commenter);
        $releases = app(CreateBoardAction::class)->handle($admin, $mobile, ['name' => 'Релизы'], BoardTemplate::Simple);
        // Пачка UX-1 (acceptance/stage-ux1): карточка MOB-1, которую комментатор e2e-editor открывает, но не переносит
        // (ТК-L76.1), и комментирует после чужого XSRF-токена (ТК-L78.1)
        app(CreateCardAction::class)->handle(
            $admin,
            $releases,
            ['title' => 'Релиз мобильного приложения'],
            BoardColumn::query()->where('board_id', $releases->id)->where('name', 'To Do')->sole(),
            Lane::query()->where('board_id', $releases->id)->sole(),
        );
        app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'E2E Перенос', 'key' => 'MOVE'], [$admin]);

        $folder = app(CreateFolderAction::class)->handle($admin, Company::primary(), 'E2E Мобильные', '📱', null);
        $node = NavNode::query()->where('space_id', $mobile->id)->sole();
        app(MoveNavNodeAction::class)->handle($admin, $node, $folder->id, null, null);

        $empty = app(CreateFolderAction::class)->handle($admin, Company::primary(), 'E2E Пустая', null, null);
        app(CreateFolderAction::class)->handle($admin, Company::primary(), 'E2E Вложенная пустая', null, $empty->id);

        // Пачка UX-2 (LATER-109): длинные названия на всех уровнях дерева — папка, в ней папка, в ней пространство
        // LONGTREE (только администратор) с доской
        $longFolder = app(CreateFolderAction::class)->handle($admin, Company::primary(), self::LONG_FOLDER, null, null);
        $longSubfolder = app(CreateFolderAction::class)->handle($admin, Company::primary(), self::LONG_SUBFOLDER, null, $longFolder->id);
        $longSpace = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => self::LONG_SPACE, 'key' => 'LONGTREE'], [$admin]);
        app(CreateBoardAction::class)->handle($admin, $longSpace, ['name' => self::LONG_BOARD], BoardTemplate::Empty);
        $longNode = NavNode::query()->where('space_id', $longSpace->id)->sole();
        app(MoveNavNodeAction::class)->handle($admin, $longNode, $longSubfolder->id, null, null);

        // Приёмка UI-1a — окно карточки (acceptance/stage-ui1, ТК-UI1.*): своё пространство, тест-кейсы меняют карточки
        $this->cardWindow($admin, $editor, $restricted);

        // Приёмка LATER-91 — подготовка к тёмной теме (acceptance/stage-L91, ТК-L91.3–L91.6)
        $this->themePrep($admin, $editor, $restricted, $candidate);

        // Приёмка «Права 2.0», П2a (acceptance/stage-R2, ТК-R2.1–R2.4)
        $this->rights2($admin, $editor, $restricted, $outsider);

        // Приёмка пачки UX-2 (acceptance/stage-ux2, ТК-L98.*, ТК-L102.1, ТК-L103.1)
        $this->uxBatch2($admin, $editor);
    }

    /**
     * «Права 2.0», П2a (приёмочные тесты ТК-R2.1–R2.4, e2e/acceptance/stage-R2): прежние сценарии прав на своих
     * пространствах вместо «Разработки», «Эксплуатации», «Маркетинга» и «Компании» демо-данных. e2e-admin — единственный
     * личный администратор каждого (Анна и Егор тест-кейсов). Не входят в систему: «E2E Руководитель» (Григорий —
     * сводка «Доступ», ТК-R2.4) и «E2E Участник ролей» (Борис ТК-R2.3: ему меняют роль и «только свои»).
     *
     * - RROLES «Права: роли», доска «Продукт» (шаблон «Простой»): e2e-editor — editor (Борис, ТК-R2.1), e2e-restricted —
     *   editor «только свои» (Жанна, ТК-R2.2), «E2E Руководитель» — editor лично и commenter через группу
     *   «E2E Руководители», «E2E Участник ролей» — editor. Карточки: RROLES-1 «Переносит редактор» (To Do, ТК-R2.1
     *   переносит и переименовывает), RROLES-2 «Чужая задача» (To Do), RROLES-3 «Задача подрядчика» (To Do, ответственный
     *   e2e-restricted — ТК-R2.2 переименовывает), RROLES-4 «Подрядчик — участник» (In Progress, e2e-restricted —
     *   участник), RROLES-5 «Готовая чужая» (Done).
     * - RREAD «Права: чтение», доска «Обсуждение»: e2e-editor — commenter (Вера, ТК-R2.1); RREAD-1 «Для комментария» (To Do).
     * - RGROUPS «Права: группы», доска «Заявки»: группа «E2E Подрядчики» (e2e-restricted) — editor «только свои»,
     *   «E2E Руководители» — commenter; RGROUPS-1 «Заявка подрядчика» (ответственный e2e-restricted),
     *   RGROUPS-2 «Чужая заявка» (ТК-R2.2, ТК-R2.4).
     * - RALL «Права: для всех» — без участников, кроме e2e-admin: ТК-R2.4 на время теста выдаёт доступ «Всем сотрудникам»
     *   и отзывает (постоянная выдача открыла бы пространство e2e-outsider и e2e-analyst — no-access.spec, groups.spec).
     * - RINTERN «Права: стажёры»: архивная группа «E2E Стажёры» (e2e-outsider) — commenter; доступа не даёт (ТК-R2.4).
     */
    private function rights2(User $admin, User $editor, User $restricted, User $outsider): void
    {
        $lead = User::factory()->create(['name' => 'E2E Руководитель', 'email' => 'e2e-lead@selen.test']);
        $member = User::factory()->create(['name' => 'E2E Участник ролей', 'email' => 'e2e-roles@selen.test']);
        $addMember = app(AddSpaceMemberAction::class);
        $grant = app(GrantSpaceGroupAction::class);
        $board = function (Space $space, string $name) use ($admin) {
            $board = app(CreateBoardAction::class)->handle($admin, $space, ['name' => $name], BoardTemplate::Simple);
            $lane = Lane::query()->where('board_id', $board->id)->sole();
            $column = fn (string $column) => BoardColumn::query()->where('board_id', $board->id)->where('name', $column)->sole();

            return fn (string $title, string $columnName = 'To Do') => app(CreateCardAction::class)
                ->handle($admin, $board, ['title' => $title], $column($columnName), $lane);
        };

        $leads = app(SaveGroupAction::class)->handle($admin, Company::primary(), ['name' => 'E2E Руководители']);
        app(AddGroupMemberAction::class)->handle($admin, $leads, $lead);
        $contractors = app(SaveGroupAction::class)->handle($admin, Company::primary(), ['name' => 'E2E Подрядчики']);
        app(AddGroupMemberAction::class)->handle($admin, $contractors, $restricted);

        $roles = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Права: роли', 'key' => 'RROLES'], [$admin]);
        foreach ([$editor, $restricted, $lead, $member] as $user) {
            $addMember->handle($admin, $roles, $user, SpaceRole::Editor);
        }
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $roles, $restricted, true);
        $grant->handle($admin, $roles, $leads, SpaceRole::Commenter);
        $card = $board($roles, 'Продукт');
        $card('Переносит редактор');
        $card('Чужая задача');
        app(UpdateCardAction::class)->handle($admin, $card('Задача подрядчика'), ['responsible_id' => $restricted->id]);
        app(AddCardParticipantAction::class)->handle($admin, $card('Подрядчик — участник', 'In Progress'), $restricted);
        $card('Готовая чужая', 'Done');

        $read = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Права: чтение', 'key' => 'RREAD'], [$admin]);
        $addMember->handle($admin, $read, $editor, SpaceRole::Commenter);
        // Не «Продукт»: две одноимённые доски в раскрытом дереве (RROLES и RREAD) не различить по названию
        $board($read, 'Обсуждение')('Для комментария');

        $groups = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Права: группы', 'key' => 'RGROUPS'], [$admin]);
        $grant->handle($admin, $groups, $contractors, SpaceRole::Editor, ownCardsOnly: true);
        $grant->handle($admin, $groups, $leads, SpaceRole::Commenter);
        $card = $board($groups, 'Заявки');
        app(UpdateCardAction::class)->handle($admin, $card('Заявка подрядчика'), ['responsible_id' => $restricted->id]);
        $card('Чужая заявка');

        app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Права: для всех', 'key' => 'RALL'], [$admin]);

        $interns = app(SaveGroupAction::class)->handle($admin, Company::primary(), ['name' => 'E2E Стажёры']);
        app(AddGroupMemberAction::class)->handle($admin, $interns, $outsider);
        $archive = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Права: стажёры', 'key' => 'RINTERN'], [$admin]);
        $grant->handle($admin, $archive, $interns, SpaceRole::Commenter);
        app(SetGroupArchivedAction::class)->handle($admin, $interns, true);
    }

    /**
     * Пачка UX-2 (LATER-98, приёмочные тесты e2e/acceptance/stage-ux2): пространство UXB «Пачка UX-2» вместо карточек
     * «Разработки» демо-данных — e2e-admin администратор (Борис тест-кейсов: создал карточки, ответственный),
     * e2e-editor — редактор (Анна тест-кейсов). Доска «Продукт» (шаблон «Разработка»). Номера — по порядку создания:
     * UXB-1 «Как DEV-41» — перенесена из To Do в Done («Перемещена…»), ответственный e2e-admin, чек-лист «Перед
     * релизом» и файл «скриншот-41.png» (ТК-L102.1, L103.1, L98.3, L98.4, L98.5, L98.7, L98.11; ТК-L98.3 прикладывает
     * к ней ещё файл); UXB-2 «Снять ответственного» — ответственный e2e-admin (ТК-L98.8); UXB-3 «План через плюс» —
     * без плана (ТК-L98.1); UXB-4 «История плана» — план 3 задан и стёрт (ТК-L98.9); UXB-5 «Без описания» — тест-кейсы
     * открывают формы и отменяют (ТК-L98.6, L98.13); UXB-6 «Блокирующая» и UXB-7 «Блокируется карточкой» (ТК-L98.10);
     * UXB-8 «Для ссылки» (ТК-L98.12).
     */
    private function uxBatch2(User $admin, User $editor): void
    {
        $space = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Пачка UX-2', 'key' => 'UXB'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $editor, SpaceRole::Editor);
        $board = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Продукт'], BoardTemplate::Development);
        $lane = Lane::query()->where('board_id', $board->id)->sole();
        $column = fn (string $name) => BoardColumn::query()->where('board_id', $board->id)->where('name', $name)->sole();
        $create = fn (string $title) => app(CreateCardAction::class)->handle($admin, $board, ['title' => $title], $column('To Do'), $lane);
        $update = app(UpdateCardAction::class);

        $window = $create('Как DEV-41');
        app(MoveCardAction::class)->handle($admin, $window, $column('Done'), $lane, null, null);
        $update->handle($admin, $window, ['responsible_id' => $admin->id]);
        $checklist = app(AddChecklistAction::class)->handle($admin, $window, 'Перед релизом');
        foreach (['Обновить документацию', 'Проверить миграции'] as $item) {
            app(AddChecklistItemAction::class)->handle($admin, $checklist, $item);
        }
        $png = tempnam(sys_get_temp_dir(), 'e2e');
        file_put_contents($png, base64_decode(self::PNG));
        app(UploadAttachmentAction::class)->handle($admin, $window, new UploadedFile($png, 'скриншот-41.png', 'image/png', null, true));
        @unlink($png);

        $update->handle($admin, $create('Снять ответственного'), ['responsible_id' => $admin->id]);
        $create('План через плюс');
        $history = $create('История плана');
        $update->handle($editor, $history, ['estimate_hours' => 3]);
        $update->handle($editor, $history, ['estimate_hours' => null]);
        $create('Без описания');
        $create('Блокирующая');
        $create('Блокируется карточкой');
        $create('Для ссылки');
    }

    /**
     * Подготовка к тёмной теме (LATER-91, приёмочные тесты ТК-L91.3–L91.6, e2e/acceptance/stage-L91): пространство THEME
     * «Тёмная тема» вместо «Разработки» демо-данных — e2e-admin администратор (Анна тест-кейсов: заводит метку,
     * ТК-L91.4), e2e-editor, e2e-restricted и e2e-candidate — редакторы (их аватары — у ответственных, ТК-L91.6; без
     * режима «только свои»). Метки пространства — цвета демо-данных (ТК-L91.4): «Бэкенд» зелёная, «Клиент» жёлтая,
     * «Техдолг» серая, «Фронтенд» синяя, «Безопасность» красная. Доска «Вид» (шаблон «Разработка» — точки всех трёх
     * категорий, дорожки «Основная» и пустая «Срочные» — полосы дорожек; ТК-L91.3, .5, .6): в To Do дорожки «Основная»
     * THEME-1 «Заблокированная» (блокировка текстом),
     * THEME-2 «Срочная», THEME-3 «Просроченная» (срок 3 дня назад), THEME-4 «Со сроком» (через неделю), в Done
     * THEME-5 «Готова в срок» и THEME-6 «Готова после срока»; THEME-7 «Для новой метки» в To Do — без ответственного,
     * ТК-L91.4 ставит ей новую метку, ТК-L91.6 открывает список ответственных. Остальные тест-кейсы карточки только
     * смотрят.
     */
    private function themePrep(User $admin, User $editor, User $restricted, User $candidate): void
    {
        $space = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Тёмная тема', 'key' => 'THEME'], [$admin]);
        foreach ([$editor, $restricted, $candidate] as $member) {
            app(AddSpaceMemberAction::class)->handle($admin, $space, $member, SpaceRole::Editor);
        }
        $labels = [];
        foreach ([
            'Бэкенд' => '#22c55e', 'Клиент' => '#f59e0b', 'Техдолг' => '#64748b', 'Фронтенд' => '#3b82f6', 'Безопасность' => '#ef4444',
        ] as $name => $color) {
            $labels[$name] = app(SaveLabelAction::class)->handle($admin, ['name' => $name, 'color' => $color], space: $space)->id;
        }

        $board = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Вид'], BoardTemplate::Development);
        $lane = Lane::query()->where('board_id', $board->id)->sole();
        // Вторая дорожка — чтобы были видны полосы дорожек (у доски с одной дорожкой полосы нет)
        app(CreateLaneAction::class)->handle($admin, $board, 'Срочные', null, null);
        $column = fn (string $name) => BoardColumn::query()->where('board_id', $board->id)->where('name', $name)->sole();
        $update = app(UpdateCardAction::class);
        /**
         * Карточка в To Do (или перенесённая в колонку $done) с ответственным и метками.
         *
         * @param  list<string>  $cardLabels
         * @param  array<string, mixed>  $fields
         */
        $card = function (string $title, User $responsible, array $cardLabels, array $fields = [], ?string $done = null) use ($editor, $board, $lane, $column, $labels, $update) {
            $card = app(CreateCardAction::class)->handle($editor, $board, ['title' => $title], $column('To Do'), $lane);
            if ($fields !== []) {
                $update->handle($editor, $card, $fields);
            }
            if ($done !== null) {
                app(MoveCardAction::class)->handle($editor, $card, $column($done), $lane, null, null);
            }
            $update->handle($editor, $card, ['responsible_id' => $responsible->id]);
            app(SyncCardLabelsAction::class)->handle($editor, $card, array_map(fn (string $name) => $labels[$name], $cardLabels));

            return $card;
        };

        $blocked = $card('Заблокированная', $admin, ['Бэкенд']);
        app(BlockCardAction::class)->handle($editor, $blocked, 'Ждём доступ к стенду', false, null);
        $card('Срочная', $editor, ['Клиент'], ['is_urgent' => true]);
        $card('Просроченная', $restricted, ['Техдолг'], ['due_date' => now()->subDays(3)->toDateString()]);
        $card('Со сроком', $candidate, ['Фронтенд', 'Безопасность'], ['due_date' => now()->addWeek()->toDateString()]);
        $card('Готова в срок', $admin, ['Бэкенд'], ['due_date' => now()->addWeek()->toDateString()], 'Done');
        $card('Готова после срока', $editor, ['Клиент'], ['due_date' => now()->subDays(3)->toDateString()], 'Done');
        $last = app(CreateCardAction::class)->handle($editor, $board, ['title' => 'Для новой метки'], $column('To Do'), $lane);
        app(SyncCardLabelsAction::class)->handle($editor, $last, [$labels['Фронтенд']]);
    }

    /**
     * Окно карточки (UI-1a, приёмочные тесты ТК-UI1.*, e2e/acceptance/stage-ui1): пространство WIN «Окно карточки» —
     * e2e-admin (администратор, он же системный — ТК-UI1.17), e2e-editor (editor — Анна тест-кейсов), e2e-restricted
     * (editor «только свои карточки» — Жанна, ТК-UI1.20); метка пространства «Окно» (ТК-UI1.7); доска «Окно» (шаблон
     * «Разработка»). У каждого тест-кейса, который меняет карточку, — своя карточка; номера — по порядку создания:
     * WIN-1 «Готовая с комментариями» — перенесена из To Do в Done («Перемещена…»), два комментария (ТК-UI1.5, ТК-UI1.18);
     * WIN-2 «Название правится» (ТК-UI1.6); WIN-3 «Поля правятся» — без ответственного (ТК-UI1.7); WIN-4 «Переносится
     * в работу» (ТК-UI1.8); WIN-5 «Для чек-листа» (ТК-UI1.11); WIN-6 «Для файла из меню» (ТК-UI1.12); WIN-7 «Для ссылки»
     * (ТК-UI1.13); WIN-8 «Для связей», WIN-9 «Дочерняя в To Do», WIN-10 «Дочерняя готовая» — в Done (ТК-UI1.14); WIN-11
     * «Для блокировки» (ТК-UI1.15); WIN-12 «Архивируется и возвращается» (ТК-UI1.16); WIN-13 «Удаляется в корзину»
     * (ТК-UI1.17); WIN-14 «Для файла перетаскиванием» (ТК-UI1.24); WIN-15 «Лежит в архиве» — в архиве (ТК-UI1.25);
     * WIN-16 «Своя карточка подрядчика» — ответственный e2e-restricted, WIN-17 «Чужая для подрядчика» (ТК-UI1.20);
     * WIN-18 «Просто карточка» — тест-кейсы её только открывают (ТК-UI1.9, .21, .22, .23, .25).
     */
    private function cardWindow(User $admin, User $editor, User $restricted): void
    {
        $space = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Окно карточки', 'key' => 'WIN'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $editor, SpaceRole::Editor);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $restricted, SpaceRole::Editor);
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $space, $restricted, true);
        app(SaveLabelAction::class)->handle($admin, ['name' => 'Окно', 'color' => '#0ea5e9'], space: $space);

        $board = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Окно'], BoardTemplate::Development);
        $lane = Lane::query()->where('board_id', $board->id)->sole();
        $column = fn (string $name) => BoardColumn::query()->where('board_id', $board->id)->where('name', $name)->sole();
        $create = fn (string $title, string $columnName = 'To Do') => app(CreateCardAction::class)
            ->handle($editor, $board, ['title' => $title], $column($columnName), $lane);

        $done = $create('Готовая с комментариями');
        app(MoveCardAction::class)->handle($editor, $done, $column('Done'), $lane, null, null);
        foreach (['Первый комментарий', 'Второй комментарий'] as $text) {
            app(AddCommentAction::class)->handle($admin, $done, [
                'type' => 'doc',
                'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]],
            ]);
        }
        foreach ([
            'Название правится', 'Поля правятся', 'Переносится в работу', 'Для чек-листа', 'Для файла из меню', 'Для ссылки',
            'Для связей', 'Дочерняя в To Do',
        ] as $title) {
            $create($title);
        }
        $create('Дочерняя готовая', 'Done');
        foreach (['Для блокировки', 'Архивируется и возвращается', 'Удаляется в корзину', 'Для файла перетаскиванием'] as $title) {
            $create($title);
        }
        app(SetCardArchivedAction::class)->handle($editor, $create('Лежит в архиве'), true);
        app(UpdateCardAction::class)->handle($editor, $create('Своя карточка подрядчика'), ['responsible_id' => $restricted->id]);
        $create('Чужая для подрядчика');
        $create('Просто карточка');
        // ТК-UI1.27 (LATER-97): срок и метки задаются через «+» — карточка без них
        $create('Срок и метки через плюс');
    }

    /** Страница пространства рядами (ADR-0019, PR 3 пакета): пространства ROWS и ARRANGE — см. описание класса. */
    private function rows(User $admin, User $editor, User $restricted): void
    {
        $create = app(CreateBoardAction::class);
        $move = app(MoveBoardAction::class);
        $card = app(CreateCardAction::class);
        $column = fn (string $boardId, string $name) => BoardColumn::query()->where('board_id', $boardId)->where('name', $name)->sole();
        $lane = fn (string $boardId) => Lane::query()->where('board_id', $boardId)->sole();

        $rows = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Ряды', 'key' => 'ROWS'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $rows, $editor, SpaceRole::Editor);
        app(AddSpaceMemberAction::class)->handle($admin, $rows, $restricted, SpaceRole::Editor);
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $rows, $restricted, true);

        $narrow = $create->handle($admin, $rows, ['name' => 'Узкая'], BoardTemplate::Empty);
        $inbox = app(CreateColumnAction::class)->handle($admin, $narrow, 'Входящие', ColumnCategory::Queue, null, null, null);
        app(CreateColumnAction::class)->handle($admin, $narrow, 'Готово', ColumnCategory::Done, null, $inbox->id, null);
        foreach (range(1, 3) as $i) {
            $card->handle($editor, $narrow, ['title' => "Узкая карточка {$i}"], $inbox, $lane($narrow->id));
        }
        $wide = $create->handle($admin, $rows, ['name' => 'Широкая'], BoardTemplate::Development);
        foreach (range(1, 6) as $i) {
            $card->handle($editor, $wide, ['title' => "Широкая карточка {$i}"], $column($wide->id, 'To Do'), $lane($wide->id));
        }
        // Своя карточка подрядчика (e2e-restricted, «только свои»): счётчик свёрнутой доски — по своим (ADR-0008)
        $own = $card->handle($editor, $wide, ['title' => 'Широкая карточка подрядчика'], $column($wide->id, 'Backlog'), $lane($wide->id));
        app(UpdateCardAction::class)->handle($editor, $own, ['responsible_id' => $restricted->id]);
        $move->handle($admin, $wide, $narrow->id, null, rowId: $narrow->row_id);

        $tall = $create->handle($admin, $rows, ['name' => 'Высокая'], BoardTemplate::Simple);
        foreach (range(1, 40) as $i) {
            $card->handle($editor, $tall, ['title' => "Высокая карточка {$i}"], $column($tall->id, 'To Do'), $lane($tall->id));
        }
        $bottom = $create->handle($admin, $rows, ['name' => 'Нижняя'], BoardTemplate::Simple);
        foreach (range(1, 2) as $i) {
            $card->handle($editor, $bottom, ['title' => "Нижняя карточка {$i}"], $column($bottom->id, 'To Do'), $lane($bottom->id));
        }
        // «Назад» и перезагрузка (space.spec): цель — «Средняя» посреди длинного пространства; «Высокая» (все карточки в одной
        // колонке — её заглушка намного ниже настоящей доски) — дальше экрана выше цели. У досок ниже «Нижней» карточки
        // поровну по колонкам — заглушки почти как настоящие доски, холст не упирается в конец
        foreach (['Промежуточная' => 40, 'Средняя' => 20, 'Последняя' => 40] as $name => $count) {
            $board = $create->handle($admin, $rows, ['name' => $name], BoardTemplate::Simple);
            $columns = ['To Do', 'In Progress', 'Review', 'Done'];
            foreach (range(1, $count) as $i) {
                $card->handle($editor, $board, ['title' => "{$name}: карточка {$i}"], $column($board->id, $columns[$i % 4]), $lane($board->id));
            }
        }

        $arrange = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => 'Перестановка', 'key' => 'ARRANGE'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $arrange, $editor, SpaceRole::Editor);
        foreach (['Первая', 'Вторая', 'Третья'] as $name) {
            $board = $create->handle($admin, $arrange, ['name' => $name], BoardTemplate::Simple);
            $card->handle($editor, $board, ['title' => "{$name}: карточка"], $column($board->id, 'To Do'), $lane($board->id));
        }

        // Приёмка PR 3 (acceptance/stage-layout, ТК-L55.12–L55.23): пространства как «Разработка» демо-данных. Раскладка
        // общая, сворачивание — личное: у тестов, которые их меняют, — свои пространства (каждый тест возвращает как было)
        $this->acceptanceRows($admin, $editor, $restricted, 'Приёмка рядов', 'RACC', 40); // ТК-L55.12, .13, .17, .20, .21 — только смотрят
        // У «Инфраструктуры» здесь ещё 12 карточек: доска из дерева встаёт к верху холста, только если она не короче экрана
        // (последняя доска — холсту дальше некуда прокручиваться), как в демо-данных — ТК-L55.18
        $this->acceptanceRows($admin, $editor, $restricted, 'Сворачивание приёмки', 'RFOLD', 40, 12); // ТК-L55.14, .18, .23
        $this->acceptanceRows($admin, $editor, $restricted, 'Перенос досок приёмки', 'RDRAG', 2); // ТК-L55.15
        $this->acceptanceRows($admin, $editor, $restricted, 'Новый ряд приёмки', 'RNEWROW', 2); // ТК-L55.16
        $this->acceptanceRows($admin, $editor, $restricted, 'Клавиатура приёмки', 'RKEYS', 2); // ТК-L55.22
        $this->acceptanceRows($admin, $editor, $restricted, 'Архивные доски приёмки', 'RARCH', 2); // ТК-L55.19
        // ТК-L55.24 (LATER-81): все четыре доски — в первом ряду, как после перестановки PM
        $four = $this->acceptanceRows($admin, $editor, $restricted, 'Четыре в ряд приёмки', 'RFOUR', 2);
        $boards = Board::query()->where('space_id', $four->id)->get()->keyBy('name');
        $move->handle($admin, $boards['Продукт'], $boards['Широкая доска']->id, null, rowId: $boards['Дежурства']->row_id);
        $move->handle($admin, $boards['Инфраструктура'], $boards['Продукт']->id, null, rowId: $boards['Дежурства']->row_id);
    }

    /**
     * Пространство для приёмочных тестов ТК-L55.12–L55.23 — как «Разработка» демо-данных: ряды [«Дежурства» (две колонки
     * «Сейчас» и «Готово», 6 карточек в «Готово»), «Широкая доска» (14 колонок без карточек)], [«Продукт» (шаблон
     * «Разработка» — шире окна; $productCards карточек в To Do и 2 карточки подрядчика в Backlog)], [«Инфраструктура»
     * (4 колонки, по карточке в To Do, In Progress, Done и ещё $infraCards в To Do)]. e2e-admin — администратор
     * пространства (Анна в тест-кейсах), e2e-editor — editor (Борис), e2e-restricted — editor «только свои карточки»
     * (Жанна): видит только 2 свои карточки «Продукта».
     */
    private function acceptanceRows(User $admin, User $editor, User $restricted, string $name, string $key, int $productCards, int $infraCards = 0): Space
    {
        $create = app(CreateBoardAction::class);
        $card = app(CreateCardAction::class);
        $columns = app(CreateColumnAction::class);
        $column = fn (string $boardId, string $name) => BoardColumn::query()->where('board_id', $boardId)->where('name', $name)->sole();
        $lane = fn (string $boardId) => Lane::query()->where('board_id', $boardId)->sole();

        $space = app(CreateSpaceAction::class)->handle($admin, Company::primary(), ['name' => $name, 'key' => $key], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $editor, SpaceRole::Editor);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $restricted, SpaceRole::Editor);
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $space, $restricted, true);

        $duty = $create->handle($admin, $space, ['name' => 'Дежурства'], BoardTemplate::Empty);
        $now = $columns->handle($admin, $duty, 'Сейчас', ColumnCategory::InProgress, null, null, null);
        $done = $columns->handle($admin, $duty, 'Готово', ColumnCategory::Done, null, $now->id, null);
        foreach (range(1, 6) as $i) {
            $card->handle($editor, $duty, ['title' => "Дежурство {$i}"], $done, $lane($duty->id));
        }

        $wide = $create->handle($admin, $space, ['name' => 'Широкая доска'], BoardTemplate::Development);
        $wideDone = $column($wide->id, 'Done');
        foreach (['Аналитика', 'Дизайн', 'Ревью дизайна', 'Документация', 'Подготовка релиза', 'Мониторинг'] as $columnName) {
            $columns->handle($admin, $wide, $columnName, ColumnCategory::InProgress, null, null, $wideDone->id);
        }
        app(MoveBoardAction::class)->handle($admin, $wide, $duty->id, null, rowId: $duty->row_id);

        $product = $create->handle($admin, $space, ['name' => 'Продукт'], BoardTemplate::Development);
        foreach (range(1, $productCards) as $i) {
            $card->handle($editor, $product, ['title' => "Задача продукта {$i}"], $column($product->id, 'To Do'), $lane($product->id));
        }
        foreach (range(1, 2) as $i) {
            $own = $card->handle($editor, $product, ['title' => "Задача подрядчика {$i}"], $column($product->id, 'Backlog'), $lane($product->id));
            app(UpdateCardAction::class)->handle($editor, $own, ['responsible_id' => $restricted->id]);
        }

        $infra = $create->handle($admin, $space, ['name' => 'Инфраструктура'], BoardTemplate::Simple);
        foreach (['To Do', 'In Progress', 'Done'] as $columnName) {
            $card->handle($editor, $infra, ['title' => "Инфраструктура: {$columnName}"], $column($infra->id, $columnName), $lane($infra->id));
        }
        for ($i = 1; $i <= $infraCards; $i++) {
            $card->handle($editor, $infra, ['title' => "Инфраструктура: задача {$i}"], $column($infra->id, 'To Do'), $lane($infra->id));
        }

        return $space;
    }
}
