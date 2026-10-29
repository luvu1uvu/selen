<?php

namespace Database\Seeders;

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\MoveCardAction;
use App\Actions\Companies\CreateCompanyAction;
use App\Actions\Guests\AddGuestAction;
use App\Actions\Navigation\CreateFolderAction;
use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Spaces\CreateSpaceAction;
use App\Actions\Spaces\GrantSpaceGroupAction;
use App\Enums\BoardTemplate;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Company;
use App\Models\Group;
use App\Models\Lane;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Демо второй и третьей компаний («Права 2.0», П2b-2; ADR-0024; только APP_ENV=local, вызывается из DatabaseSeeder
 * после BoardsDemoSeeder). Имена вымышленные.
 *
 * - «Компания 2» — свои папка, пространства SALES «Продажи» и SUP «Поддержка» с досками и карточками, свои люди
 *   и администратор компании irina@selen.test (Ирина Морозова);
 * - «Компания 3» — маленькая: одно пространство STOCK «Склад»; её администратор — тоже Ирина (у неё в админке выбор
 *   из двух компаний), сотрудница — nina@selen.test;
 * - oleg@selen.test (Олег Никитин) — «дом» в «Компании 1» и «Компании 2»: в дереве у него заголовки обеих компаний;
 *   администратор каждой из них убирает его только из своей (деактивация в компании, П2c);
 * - гости (П2c): boris@selen.test («Компания 1») — гость «Компании 2» в «Поддержке» (Комментатор, без срока);
 *   vera@selen.test («Компания 1») — гость «Компании 3» в «Складе» (Редактор, срок — 30 дней).
 *
 * Компании создаёт Владелец (CreateCompanyAction — справочники из шаблона), пространства — администратор компании.
 */
class CompaniesDemoSeeder extends Seeder
{
    /** @var array<string, User> */
    private array $people = [];

    public function run(): void
    {
        mt_srand(2027);
        $owner = User::query()->where('email', 'owner@selen.test')->firstOrFail();
        $create = app(CreateCompanyAction::class);
        $second = $create->handle($owner, 'Компания 2');
        $third = $create->handle($owner, 'Компания 3');

        $this->person($second, 'irina', 'Ирина Морозова', admin: true);
        $this->people['irina']->companies()->attach($third->id, ['kind' => 'home', 'is_admin' => true]);
        $this->person($second, 'kirill', 'Кирилл Волков');
        $this->person($second, 'larisa', 'Лариса Павлова');
        $this->person($second, 'maxim', 'Максим Фёдоров');
        $this->person($third, 'nina', 'Нина Белова');
        $this->person(Company::primary(), 'oleg', 'Олег Никитин');
        $this->people['oleg']->companies()->attach($second->id, ['kind' => 'home']);

        $irina = $this->people['irina'];
        $folder = app(CreateFolderAction::class)->handle($irina, $second, 'Клиентский отдел', '🤝', null);
        $spaces = app(CreateSpaceAction::class);
        $sales = $spaces->handle($irina, $second, ['name' => 'Продажи', 'key' => 'SALES', 'description' => 'Сделки с клиентами'], [$irina], '💼', $folder->id);
        $support = $spaces->handle($irina, $second, ['name' => 'Поддержка', 'key' => 'SUP', 'description' => 'Обращения клиентов'], [$irina], null, $folder->id);
        $stock = $spaces->handle($irina, $third, ['name' => 'Склад', 'key' => 'STOCK', 'description' => 'Поставки и остатки'], [$irina], '📦');

        $add = app(AddSpaceMemberAction::class);
        foreach ([
            [$sales, 'kirill', SpaceRole::Editor], [$sales, 'maxim', SpaceRole::Commenter], [$sales, 'oleg', SpaceRole::Editor],
            [$support, 'larisa', SpaceRole::Editor], [$stock, 'nina', SpaceRole::Editor],
        ] as [$space, $login, $role]) {
            $add->handle($irina, $space, $this->people[$login], $role);
        }
        // «Поддержку» видят все сотрудники «Компании 2» (и Олег — её «дом»)
        app(GrantSpaceGroupAction::class)->handle($irina, $support, Group::everyone($second), SpaceRole::Commenter);
        // Олег в «Компании 1» — комментатор «Разработки» (её доступ выдаёт администратор DEV)
        $dev = Space::query()->where('key', 'DEV')->firstOrFail();
        $add->handle(User::query()->where('email', 'anna@selen.test')->firstOrFail(), $dev, $this->people['oleg'], SpaceRole::Commenter);

        $this->fill($this->board($sales, 'Сделки'), 'kirill', [
            'Коммерческое предложение для «Север-Логистик»', 'Демо продукта для сети аптек', 'Продление договора с типографией',
            'Счёт на оплату для «Зелёного дома»', 'Встреча с закупками «Альфа-Строя»', 'Пилот для пекарни на Садовой',
        ]);
        $this->fill($this->board($support, 'Обращения'), 'larisa', [
            'Не приходит письмо со счётом', 'Вопрос по тарифу «Команда»', 'Сбросить пароль сотруднику клиента',
            'Ошибка при выгрузке отчёта', 'Подключить второго администратора',
        ]);
        $this->fill($this->board($stock, 'Поставки'), 'nina', [
            'Приёмка бумаги А4', 'Инвентаризация стеллажа 3', 'Возврат брака поставщику', 'Заказ картриджей',
        ]);

        // Гости (П2c): сотрудники «Компании 1» с личным доступом к пространству чужой компании
        $guests = app(AddGuestAction::class);
        $guests->handle($irina, $second, 'boris@selen.test', null, [['node' => $support->navNode, 'roles' => [Role::standard(StandardRole::Commenter)]]]);
        $guests->handle($irina, $third, 'vera@selen.test', now('Europe/Moscow')->addDays(30)->endOfDay()->utc(), [['node' => $stock->navNode, 'roles' => [Role::standard(StandardRole::Editor)]]]);

        $this->command->info('Компании: «Компания 2» (SALES, SUP; администратор irina@selen.test), «Компания 3» (STOCK; администратор — тоже Ирина).');
        $this->command->info('Гости: boris@selen.test — в «Поддержке» «Компании 2» без срока, vera@selen.test — в «Складе» «Компании 3» на 30 дней.');
        $this->command->info('oleg@selen.test — сотрудник «Компании 1» и «Компании 2» (два «дома»); пароль у всех тот же.');
    }

    private function person(Company $company, string $login, string $name, bool $admin = false): void
    {
        $this->people[$login] = User::factory()->inCompany($company, $admin)->create(['name' => $name, 'email' => "{$login}@selen.test"]);
    }

    private function board(Space $space, string $name): Board
    {
        return app(CreateBoardAction::class)->handle($this->people['irina'], $space, ['name' => $name, 'description' => null], BoardTemplate::Simple);
    }

    /**
     * Карточки доски от имени редактора: первая колонка, часть — дальше по процессу.
     *
     * @param  list<string>  $titles
     */
    private function fill(Board $board, string $editor, array $titles): void
    {
        $actor = $this->people[$editor];
        // Листовые колонки по порядку; доска — уже загружена (ленивая загрузка у моделей из коллекции запрещена)
        $columns = BoardColumn::query()->where('board_id', $board->id)->whereNull('archived_at')->orderBy('position')->get()
            ->filter(fn (BoardColumn $column) => ! BoardColumn::query()->where('parent_id', $column->id)->exists())
            ->each(fn (BoardColumn $column) => $column->setRelation('board', $board))
            ->values();
        $lane = Lane::query()->where('board_id', $board->id)->orderBy('position')->firstOrFail();
        $create = app(CreateCardAction::class);
        $move = app(MoveCardAction::class);

        foreach ($titles as $title) {
            $card = $create->handle($actor, $board, ['title' => $title], $columns[0], $lane);
            $step = mt_rand(0, $columns->count() - 1);
            if ($step > 0) {
                $move->handle($actor, $card, $columns[$step], $lane, null, null);
            }
        }
    }
}
