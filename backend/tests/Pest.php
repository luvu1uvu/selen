<?php

use App\Actions\Boards\CreateBoardAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\MoveCardAction;
use App\Actions\Navigation\CreateFolderAction;
use App\Enums\BoardTemplate;
use App\Enums\CardScope;
use App\Enums\Permission;
use App\Enums\SpaceRole;
use App\Enums\StandardRole;
use App\Enums\UserRole;
use App\Models\AccessGrant;
use App\Models\Attachment;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardBlock;
use App\Models\CardLink;
use App\Models\CardRelation;
use App\Models\Checklist;
use App\Models\ChecklistItem;
use App\Models\Comment;
use App\Models\Company;
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\Space;
use App\Models\User;
use App\Services\Attachments\AttachmentFiles;
use App\Services\Positions\Positioner;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Support\Browser;
use Tests\Support\RefreshDatabaseAsOwner;
use Tests\TestCase;

/*
| Feature-тесты работают на PostgreSQL (база selen_testing) внутри транзакции,
| которая откатывается после каждого теста (RefreshDatabase). Схему пересоздаёт владелец, тесты идут под ролью
| приложения (RefreshDatabaseAsOwner, docs/adr/0016-db-roles.md).
| DatabaseTruncation не используем: триггер event_log запрещает TRUNCATE (а у роли приложения нет и права).
*/
pest()->extend(TestCase::class)
    ->use(RefreshDatabaseAsOwner::class)
    ->in('Feature');

/**
 * Запрос под владельцем схемы (docs/adr/0016-db-roles.md): проверить триггеры append-only, до которых роль
 * приложения не доходит — у неё нет прав. Отдельное подключение вне транзакции теста; lock_timeout — чтобы
 * не ждать вечно блокировку, которую держит транзакция теста.
 */
function asOwner(string $sql): void
{
    $owner = DB::connection('pgsql_owner');
    $owner->statement("SET lock_timeout = '3s'");
    $owner->statement($sql);
}

/** Выполнить $test под владельцем схемы в транзакции, которая откатывается. */
function asSchemaOwner(Closure $test): void
{
    $connection = DB::connection('pgsql_owner');
    $connection->statement("SET lock_timeout = '3s'");
    $connection->beginTransaction();

    try {
        DB::usingConnection('pgsql_owner', $test);
    } finally {
        $connection->rollBack();
    }
}

/** Миграция компаний («Права 2.0», П2b-1): тесты прежних миграций откатывают её первой (down) и поднимают обратно (up). */
function companiesMigration(): object
{
    return require database_path('migrations/2026_10_23_300001_create_companies.php');
}

/** Отдельный «браузер» со своими cookie (сессия, «Запомнить меня»). */
function browser(string $ip = '10.0.0.1'): Browser
{
    return new Browser(test(), $ip);
}

/** Администратор компании (по умолчанию — «Компании 1», ADR-0024). */
function admin(array $attributes = [], ?Company $company = null): User
{
    return User::factory()->admin($company)->create($attributes);
}

/** Владелец системы (ADR-0017): в базе не больше одного. Не путать с asOwner() — владельцем схемы БД. */
function owner(array $attributes = []): User
{
    return User::factory()->owner()->create($attributes);
}

/** Участник компании — её «дом» (по умолчанию — «Компании 1»). */
function member(array $attributes = [], ?Company $company = null): User
{
    return ($company === null ? User::factory() : User::factory()->inCompany($company))->create($attributes);
}

/** «Компания 1» — её создаёт миграция (ADR-0024); в ней по умолчанию все фабрики. */
function company(): Company
{
    return Company::primary();
}

/** Вторая компания со справочниками из шаблона (тесты изоляции). */
function otherCompany(array $attributes = []): Company
{
    return Company::factory()->create($attributes);
}

/** Адрес API админки компании (по умолчанию — «Компании 1»): adminPath().'users' → /api/v1/admin/companies/{id}/users. */
function adminPath(?Company $company = null): string
{
    return '/api/v1/admin/companies/'.($company ?? Company::primary())->id.'/';
}

function space(array $attributes = []): Space
{
    return Space::factory()->create($attributes);
}

/** Добавить участника (личная выдача) в обход Actions: роль API или стандартная роль (подготовка данных теста). */
function addToSpace(Space $space, User $user, SpaceRole|StandardRole $role): AccessGrant
{
    return grantAccess($space, $user, $role instanceof SpaceRole ? StandardRole::fromLegacy($role) : $role);
}

/** Выдача доступа к пространству в обход Actions: пользователю или группе, стандартная роль или любая роль. */
function grantAccess(Space $space, User|Group $subject, StandardRole|Role $role): AccessGrant
{
    return AccessGrant::query()->forceCreate([
        'company_id' => $space->company_id,
        'nav_node_id' => nodeOf($space)->id,
        'user_id' => $subject instanceof User ? $subject->id : null,
        'group_id' => $subject instanceof Group ? $subject->id : null,
        'role_id' => ($role instanceof Role ? $role : Role::standard($role))->id,
    ])->load('role');
}

/** Режим «только свои карточки» для личных выдач пользователя (в пространстве или во всех) в обход Actions. */
function restrictToOwnCards(User $user, ?Space $space = null): void
{
    AccessGrant::query()->where('user_id', $user->id)->when($space !== null, fn ($q) => $q->onSpace($space))->with('role')->get()
        ->each(fn (AccessGrant $grant) => $grant->forceFill([
            'role_id' => standardRole(StandardRole::fromLegacy($grant->standardRole()->legacyRole(), ownCardsOnly: true))->id,
        ])->save());
}

/** Стандартная роль из базы (её создаёт миграция). */
function standardRole(StandardRole $role): Role
{
    return Role::standard($role);
}

/**
 * Роль с заданным набором прав — как пользовательская роль (П2e), для матрицы по правам каталога.
 * Чтение (Permission::alwaysGranted) входит в любую роль.
 *
 * @param  list<Permission>  $permissions
 */
function makeRole(array $permissions, CardScope $scope = CardScope::All, ?Company $company = null): Role
{
    // Пользовательская роль — справочник компании (ADR-0024)
    $role = Role::query()->forceCreate([
        'company_id' => ($company ?? Company::primary())->id,
        'name' => 'Роль '.Str::random(8),
        'card_scope' => $scope,
        'position' => 'a9',
    ]);
    $values = collect([...Permission::alwaysGranted(), ...$permissions])->map(fn (Permission $p) => $p->value)->unique();
    DB::table('role_permissions')->insert($values->map(fn (string $p) => ['role_id' => $role->id, 'permission' => $p])->all());

    return $role;
}

/** Группа пользователей в обход Actions (подготовка данных теста); компания — «Компания 1», если не задана. */
function makeGroup(array $attributes = []): Group
{
    return Group::query()->forceCreate($attributes + ['name' => 'Группа '.Str::random(8), 'company_id' => Company::primary()->id]);
}

/** Добавить людей в группу в обход Actions. */
function addToGroup(Group $group, User ...$users): Group
{
    foreach ($users as $user) {
        $group->members()->attach($user->id, ['created_at' => now()]);
    }

    return $group;
}

/** Выдать группе доступ к пространству в обход Actions (роль API + «только свои карточки»). */
function grantGroup(Space $space, Group $group, SpaceRole $role, bool $ownCardsOnly = false): AccessGrant
{
    return grantAccess($space, $group, StandardRole::fromLegacy($role, $ownCardsOnly));
}

/** Доступ к пространству только через новую группу (пользователь в ней один). */
function addToSpaceViaGroup(Space $space, User $user, SpaceRole $role, bool $ownCardsOnly = false): Group
{
    $group = addToGroup(makeGroup(), $user);
    grantGroup($space, $group, $role, $ownCardsOnly);

    return $group;
}

/** Папка дерева навигации — через настоящий Action (позиция, проверки глубины); компания — родителя или «Компании 1». */
function makeFolder(string $name, ?NavNode $parent = null, ?string $icon = null, ?Company $company = null): NavNode
{
    $company = $parent->company ?? $company ?? Company::primary();
    $actor = User::query()->where('role', UserRole::Owner)->first() ?? admin(company: $company);

    return app(CreateFolderAction::class)->handle($actor, $company, $name, $icon, $parent?->id);
}

/** Узел пространства в дереве навигации. */
function nodeOf(Space $space): NavNode
{
    return NavNode::query()->where('space_id', $space->id)->firstOrFail();
}

/**
 * Узлы дерева GET /navigation, когда пользователю видна одна компания (ответ — деревья по компаниям, ADR-0024; у кого
 * компания одна — одно дерево без названия). Пусто — нет ни одного дерева.
 *
 * @return list<array<string, mixed>>
 */
function navItems(TestResponse $response): array
{
    $trees = $response->assertOk()->json('data');
    expect(count($trees))->toBeLessThanOrEqual(1);
    if ($trees !== []) {
        // Компания одна — её названия в ответе нет (решение PM 23.10, вопрос 5)
        expect($trees[0]['name'])->toBeNull();
    }

    return $trees[0]['items'] ?? [];
}

/** Дерево GET /navigation без вложенности: «[папка]» или ключ пространства с отступом по глубине. */
function flatTree(array $nodes, int $depth = 0): array
{
    $rows = [];
    foreach ($nodes as $node) {
        $rows[] = str_repeat('  ', $depth).($node['type'] === 'folder' ? "[{$node['name']}]" : $node['space']['key']);
        if ($node['type'] === 'folder') {
            array_push($rows, ...flatTree($node['children'], $depth + 1));
        }
    }

    return $rows;
}

/** Положить узел в папку (или в корень) в обход Actions — в конец. */
function placeIn(NavNode $node, ?NavNode $folder): NavNode
{
    $node->forceFill([
        'parent_id' => $folder?->id,
        'position' => app(Positioner::class)->atEnd(NavNode::siblingsOf($node->company_id, $folder?->id, $node->id)),
    ])->save();

    return $node;
}

/** Доска из шаблона — через настоящий Action (колонки, дорожка, событие). */
function makeBoard(Space $space, User $actor, BoardTemplate $template = BoardTemplate::Development, string $name = 'Доска'): Board
{
    return app(CreateBoardAction::class)->handle($actor, $space, ['name' => $name], $template);
}

/** Активная колонка доски по названию. */
function columnNamed(Board $board, string $name): BoardColumn
{
    return BoardColumn::query()->where('board_id', $board->id)->where('name', $name)->whereNull('archived_at')->sole();
}

function firstLane(Board $board): Lane
{
    return Lane::query()->where('board_id', $board->id)->whereNull('archived_at')->orderBy('position')->firstOrFail();
}

/** Карточка в колонке (первая дорожка) — через настоящий Action. */
function makeCard(Board $board, string $column, User $actor, string $title = 'Карточка', ?Lane $lane = null): Card
{
    return app(CreateCardAction::class)->handle($actor, $board, ['title' => $title], columnNamed($board, $column), $lane ?? firstLane($board));
}

/** Перенести карточку в колонку (та же дорожка) — через настоящий Action. */
function moveCard(Card $card, string $column, User $actor): Card
{
    $card = $card->fresh();

    return app(MoveCardAction::class)->handle($actor, $card, columnNamed($card->board, $column), $card->lane, null, null);
}

/** Содержимое карточки в обход Actions (подготовка данных теста). */
function makeComment(Card $card, User $author, string $text = 'Комментарий'): Comment
{
    $comment = new Comment;
    $comment->forceFill(['card_id' => $card->id, 'author_id' => $author->id, 'body' => richText($text)])->save();

    return $comment;
}

function makeChecklist(Card $card, string $title = 'Чек-лист'): Checklist
{
    $checklist = new Checklist(['title' => $title]);
    $checklist->forceFill(['card_id' => $card->id, 'position' => 'a'.Str::lower(Str::random(4))])->save();

    return $checklist;
}

function makeChecklistItem(Checklist $checklist, string $text = 'Пункт'): ChecklistItem
{
    $item = new ChecklistItem(['text' => $text]);
    $item->forceFill(['checklist_id' => $checklist->id, 'position' => 'a'.Str::lower(Str::random(4))])->save();

    return $item;
}

function makeCardLink(Card $card, User $user): CardLink
{
    $link = new CardLink(['url' => 'https://example.com/doc', 'title' => 'Документ']);
    $link->forceFill(['card_id' => $card->id, 'created_by' => $user->id])->save();

    return $link;
}

/** Вложение с настоящим файлом на (поддельном) диске вложений. */
function makeAttachment(Card $card, User $user, string $name = 'photo.png', string $content = 'png', string $mime = 'image/png'): Attachment
{
    $path = $card->id.'/'.Str::ulid()->toBase32();
    Storage::disk('attachments')->put($path, $content);
    $attachment = new Attachment;
    $attachment->forceFill([
        'card_id' => $card->id, 'uploaded_by' => $user->id, 'disk' => 'attachments', 'path' => $path,
        'name' => $name, 'mime' => $mime, 'size' => strlen($content),
        'kind' => AttachmentFiles::INLINE_TYPES[$mime] ?? 'file',
    ])->save();

    return $attachment;
}

/** Минимальный настоящий PNG 1×1. */
const PNG_1X1 = "\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x01\x08\x06\0\0\0\x1f\x15\xc4\x89\0\0\0\rIDATx\x9cc\xf8\x0f\0\x01\x01\x01\0\x18\xdd\x8d\xb4\0\0\0\0IEND\xaeB`\x82";

/** Начало файла QuickTime (запись экрана macOS): finfo определяет его как video/quicktime. */
const MOV_HEADER = "\0\0\0\x14ftypqt  \0\0\0\0qt  \0\0\0\x08free";

/**
 * Настоящий загруженный файл: тип определяется по содержимому (finfo), как в production.
 * UploadedFile::fake() угадывает тип по расширению — для этих проверок не годится.
 */
function uploadedFile(string $name, string $content): UploadedFile
{
    $path = tempnam(sys_get_temp_dir(), 'upload');
    file_put_contents($path, $content);

    return new UploadedFile($path, $name, null, null, true);
}

/** Связь «родитель — дочерняя» в обход Actions (подготовка данных теста). */
function makeRelation(Card $parent, Card $child, User $user): CardRelation
{
    $relation = new CardRelation;
    $relation->forceFill(['parent_id' => $parent->id, 'child_id' => $child->id, 'created_by' => $user->id])->save();

    return $relation;
}

/** Активная блокировка в обход Actions: по тексту или по карточке. */
function makeBlock(Card $card, User $user, ?Card $blocker = null, ?string $reason = 'Ждём доступы'): CardBlock
{
    $block = new CardBlock;
    $block->forceFill([
        'card_id' => $card->id, 'blocking_card_id' => $blocker?->id, 'reason' => $reason,
        'started_at' => now(), 'started_by' => $user->id,
    ])->save();

    return $block;
}

/**
 * Документ визуального редактора из абзацев; упоминания — ['mention' => id] среди строк.
 *
 * @return array<string, mixed>
 */
function richText(string|array ...$parts): array
{
    $inline = array_map(fn ($part) => is_array($part)
        ? ['type' => 'mention', 'attrs' => ['id' => $part['mention']]]
        : ['type' => 'text', 'text' => $part], $parts);

    return ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => $inline]]];
}

/**
 * Типы событий журнала в порядке записи.
 *
 * @return list<string>
 */
function loggedEventTypes(): array
{
    return EventLogEntry::query()->orderBy('id')->pluck('event_type')->all();
}

/**
 * Журнал событий не содержит персональных данных (ADR-0003): ни email, ни имени
 * ни одного пользователя в payload и meta, ни IP-адресов в meta.
 */
function expectNoPersonalDataInEventLog(): void
{
    $rows = DB::table('event_log')->select(['payload', 'meta'])->get();
    expect($rows)->not->toBeEmpty();

    $journal = mb_strtolower($rows->map(fn ($row) => $row->payload.' '.$row->meta)->implode("\n"));

    foreach (User::query()->get(['name', 'email']) as $user) {
        expect($journal)
            ->not->toContain(mb_strtolower($user->email))
            ->not->toContain(mb_strtolower($user->name));
    }

    expect($journal)->not->toMatch('/\b\d{1,3}(\.\d{1,3}){3}\b/')
        ->not->toContain('user_agent');
}
