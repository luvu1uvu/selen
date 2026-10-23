<?php

namespace App\Services\PmStand;

use App\Enums\ColumnCategory;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\Company;
use App\Models\Lane;
use App\Models\Space;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Стенд PM (ADR-0014): пространство LATER «Временно, пока реализовывается» — отложенные задачи и баги приёмки.
 * Доски, колонки и метки ищутся по названию, поэтому повторный запуск команд стенда ничего не дублирует.
 */
final class PmStand
{
    public const SPACE_KEY = 'LATER';

    public const SPACE_NAME = 'Временно, пока реализовывается';

    public const BACKLOG_BOARD = 'Бэклог';

    public const BUGS_BOARD = 'Баги приёмки';

    /** Тип карточки бага (создаётся миграцией card_types). */
    public const BUG_TYPE = 'Баг';

    public const BOT_NAME = 'QA-бот';

    /** @var array<string, ColumnCategory> */
    public const BACKLOG_COLUMNS = [
        'Идеи / без решения' => ColumnCategory::Queue,
        'Отложено до этапа' => ColumnCategory::Queue,
        'Взято в работу' => ColumnCategory::InProgress,
        'Сделано' => ColumnCategory::Done,
    ];

    /** Колонка «Бэклога», куда make pm-task заводит работу без карточки на стенде. */
    public const TASK_COLUMN = 'Взято в работу';

    /** @var array<string, ColumnCategory> */
    public const BUGS_COLUMNS = [
        'Новый' => ColumnCategory::Queue,
        'Исправляется' => ColumnCategory::InProgress,
        'Исправлено' => ColumnCategory::Done,
        'Не баг — решение PM' => ColumnCategory::Done,
    ];

    /** Метки пространства: название → цвет. */
    public const LABELS = [
        'этап 7' => '#3b82f6',
        'этап 8' => '#22c55e',
        'этап 11' => '#a855f7',
        'инфраструктура' => '#64748b',
        'безопасность' => '#ef4444',
        'UX' => '#f59e0b',
    ];

    /**
     * Описание доски «Баги приёмки» — шаблон бага для PM (показывается под названием доски).
     * pm-backlog ставит его, только если описание пустое: правки PM не перезаписываются.
     */
    public const BUGS_BOARD_DESCRIPTION = <<<'TEXT'
        Как завести баг: «+ Карточка» в колонке «Новый», тип «Баг», метка подэтапа (например, 3c). Замечание по удобству или внешнему виду (не поломка) — метка «UX».
        В описании карточки:
        Где — экран и путь к нему (Дерево → … → …).
        Шаги воспроизведения — по пунктам.
        Ожидаемый результат — как должно быть.
        Фактический результат — что произошло.
        Скриншот — вложением (раздел «Файлы» в карточке).
        TEXT;

    /** Цвет меток подэтапов («3c», «4a»), которые заводит make pm-bug. */
    public const SUBSTAGE_LABEL_COLOR = '#0ea5e9';

    public static function space(): ?Space
    {
        return Space::query()->where('key', self::SPACE_KEY)->first();
    }

    /**
     * Компания стенда: компания пространства LATER, а до его создания — «Компания 1» (ADR-0024: на стенде всё — в ней,
     * решение PM 21.10).
     */
    public static function company(): Company
    {
        return self::space()->company ?? Company::primary();
    }

    /** Пространство LATER — или понятная ошибка, если make pm-backlog ещё не запускали. */
    public static function requireSpace(): Space
    {
        return self::space() ?? throw ValidationException::withMessages([
            'space' => 'Пространства LATER нет — сначала выполните make pm-backlog.',
        ]);
    }

    public static function board(Space $space, string $name): ?Board
    {
        return $space->boards()->active()->where('name', $name)->first();
    }

    public static function requireBoard(Space $space, string $name): Board
    {
        return self::board($space, $name) ?? throw ValidationException::withMessages([
            'board' => "В LATER нет доски «{$name}» — выполните make pm-backlog.",
        ]);
    }

    /** Колонка доски по названию без учёта регистра. */
    public static function column(Board $board, string $name): ?BoardColumn
    {
        return $board->columns()->active()
            ->whereRaw('lower(name) = lower(?)', [trim($name)])
            ->first();
    }

    /** Колонка доски по названию — или ошибка со списком допустимых. */
    public static function requireColumn(Board $board, string $name): BoardColumn
    {
        return self::column($board, $name) ?? throw ValidationException::withMessages([
            'column' => sprintf(
                'На доске «%s» нет колонки «%s». Есть: %s.',
                $board->name,
                $name,
                $board->columns()->active()->orderBy('position')->pluck('name')->implode(', '),
            ),
        ]);
    }

    /** Карточка пространства LATER по номеру (LATER-12) — или понятная ошибка. */
    public static function requireCard(string $key): Card
    {
        $key = mb_strtoupper(trim($key));
        $card = (new Card)->resolveRouteBinding($key);

        if ($card === null || $card->space_id !== self::requireSpace()->id) {
            throw ValidationException::withMessages(['card' => "В пространстве LATER нет карточки {$key}."]);
        }

        return $card;
    }

    /** Первая дорожка доски (у досок стенда она одна — «Основная»). */
    public static function lane(Board $board): Lane
    {
        /** @var Lane */
        return $board->lanes()->active()->orderBy('position')->firstOrFail();
    }

    /** Подсказка, когда владелец LATER из .env стенда (PM_OWNER_EMAIL) не найден или деактивирован. */
    public const OWNER_HINT = 'владелец LATER в .env стенда устарел — укажите актуальный: make pm-backlog OWNER=ваш@email';

    /** Активный пользователь по email — или ошибка: нет такого / деактивирован, и что делать. */
    public static function requireUser(string $email, string $hint): User
    {
        $user = User::query()->where('email', mb_strtolower(trim($email)))->first();

        if ($user === null) {
            throw ValidationException::withMessages(['user' => "Нет пользователя {$email} — {$hint}."]);
        }
        if (! $user->isActive()) {
            throw ValidationException::withMessages(['user' => "Пользователь {$email} деактивирован — {$hint}."]);
        }

        return $user;
    }
}
