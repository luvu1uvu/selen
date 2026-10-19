<?php

namespace Database\Seeders;

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\SetCardArchivedAction;
use App\Actions\Cards\UpdateCardAction;
use App\Actions\Columns\CreateColumnAction;
use App\Actions\Groups\SaveGroupAction;
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
use App\Models\BoardColumn;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\User;
use Illuminate\Database\Seeder;

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
 * в To Do), «Срочные» (2 в To Do, 1 в In Progress) и «Плановые» (1 в Backlog).
 *
 * Дерево (tree.spec): папка «E2E Мобильные» с пространством MOB «Мобильные приложения» (доска «Релизы»,
 * e2e-editor — commenter); QA и MOVE «E2E Перенос» (только администратор) — в корне.
 * Пустая папка «E2E Пустая» с вложенной «E2E Вложенная пустая» — в дереве видна только Владельцу (тест-кейсы 3c).
 */
class E2eSeeder extends Seeder
{
    /** Дорожка с длинным названием на доске «Дорожки» (add-card.spec, LATER-49). */
    public const LONG_LANE = 'Очень длинное название дорожки для проверки многоточия в форме';

    public function run(): void
    {
        User::factory()->owner()->create(['name' => 'E2E Владелец', 'email' => 'e2e-owner@selen.test']);
        $admin = User::factory()->admin()->create(['name' => 'E2E Администратор', 'email' => 'e2e-admin@selen.test']);
        $editor = User::factory()->create(['name' => 'E2E Редактор', 'email' => 'e2e-editor@selen.test']);
        User::factory()->create(['name' => 'E2E Посторонний', 'email' => 'e2e-outsider@selen.test']);
        $restricted = User::factory()->create(['name' => 'E2E Подрядчик', 'email' => 'e2e-restricted@selen.test']);
        User::factory()->create(['name' => 'E2E Аналитик', 'email' => 'e2e-analyst@selen.test']);
        // ТК-3.26 (acceptance/stage-3): Владелец назначает его администратором и снимает. Не входит в систему —
        // смена его роли не задевает сохранённые входы других тестов
        User::factory()->create(['name' => 'E2E Кандидат', 'email' => 'e2e-candidate@selen.test']);

        $space = app(CreateSpaceAction::class)->handle($admin, ['name' => 'Сквозные тесты', 'key' => 'QA'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $editor, SpaceRole::Editor);
        app(AddSpaceMemberAction::class)->handle($admin, $space, $restricted, SpaceRole::Editor);
        app(SetSpaceMemberRestrictionAction::class)->handle($admin, $space, $restricted, true);
        $analysts = app(SaveGroupAction::class)->handle($admin, ['name' => 'E2E Аналитики']);
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
        $layout = app(CreateSpaceAction::class)->handle($admin, ['name' => 'Раскладка', 'key' => 'LAYOUT'], [$admin]);
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

        // Форма «+» в заголовке колонки (add-card.spec, LATER-49): две дорожки, у второй — длинное название
        // (многоточие), у In Progress — подколонки
        $lanes = app(CreateBoardAction::class)->handle($admin, $space, ['name' => 'Дорожки'], BoardTemplate::Simple);
        app(CreateLaneAction::class)->handle($admin, $lanes, self::LONG_LANE, null, null);
        $inProgress = BoardColumn::query()->where('board_id', $lanes->id)->where('name', 'In Progress')->sole();
        app(CreateColumnAction::class)->handle($admin, $lanes, 'Разработка', null, $inProgress, null, null);
        app(CreateColumnAction::class)->handle($admin, $lanes, 'Ревью', null, $inProgress, null, null);

        $mobile = app(CreateSpaceAction::class)->handle($admin, ['name' => 'Мобильные приложения', 'key' => 'MOB'], [$admin]);
        app(AddSpaceMemberAction::class)->handle($admin, $mobile, $editor, SpaceRole::Commenter);
        app(CreateBoardAction::class)->handle($admin, $mobile, ['name' => 'Релизы'], BoardTemplate::Simple);
        app(CreateSpaceAction::class)->handle($admin, ['name' => 'E2E Перенос', 'key' => 'MOVE'], [$admin]);

        $folder = app(CreateFolderAction::class)->handle($admin, 'E2E Мобильные', '📱', null);
        $node = NavNode::query()->where('space_id', $mobile->id)->sole();
        app(MoveNavNodeAction::class)->handle($admin, $node, $folder->id, null, null);

        $empty = app(CreateFolderAction::class)->handle($admin, 'E2E Пустая', null, null);
        app(CreateFolderAction::class)->handle($admin, 'E2E Вложенная пустая', null, $empty->id);
    }
}
