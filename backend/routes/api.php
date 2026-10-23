<?php

use App\Http\Controllers\Api\V1\Admin\CardTypeController as AdminCardTypeController;
use App\Http\Controllers\Api\V1\Admin\EventLogController;
use App\Http\Controllers\Api\V1\Admin\GroupController as AdminGroupController;
use App\Http\Controllers\Api\V1\Admin\InvitationController;
use App\Http\Controllers\Api\V1\Admin\LabelController as AdminLabelController;
use App\Http\Controllers\Api\V1\Admin\NavigationController as AdminNavigationController;
use App\Http\Controllers\Api\V1\Admin\SpaceController as AdminSpaceController;
use App\Http\Controllers\Api\V1\Admin\TrashController as AdminTrashController;
use App\Http\Controllers\Api\V1\Admin\UserAccessController;
use App\Http\Controllers\Api\V1\Admin\UserController;
use App\Http\Controllers\Api\V1\AttachmentController;
use App\Http\Controllers\Api\V1\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\NewPasswordController;
use App\Http\Controllers\Api\V1\Auth\PasswordResetLinkController;
use App\Http\Controllers\Api\V1\BoardColumnController;
use App\Http\Controllers\Api\V1\BoardController;
use App\Http\Controllers\Api\V1\CardBlockController;
use App\Http\Controllers\Api\V1\CardController;
use App\Http\Controllers\Api\V1\CardLabelController;
use App\Http\Controllers\Api\V1\CardLinkController;
use App\Http\Controllers\Api\V1\CardParticipantController;
use App\Http\Controllers\Api\V1\CardRelationController;
use App\Http\Controllers\Api\V1\CardSearchController;
use App\Http\Controllers\Api\V1\CardTypeController;
use App\Http\Controllers\Api\V1\ChecklistController;
use App\Http\Controllers\Api\V1\CommentController;
use App\Http\Controllers\Api\V1\GroupDirectoryController;
use App\Http\Controllers\Api\V1\InvitationAcceptanceController;
use App\Http\Controllers\Api\V1\LabelController;
use App\Http\Controllers\Api\V1\LaneController;
use App\Http\Controllers\Api\V1\NavigationController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\SpaceController;
use App\Http\Controllers\Api\V1\SpaceGroupController;
use App\Http\Controllers\Api\V1\SpaceMemberController;
use App\Http\Controllers\Api\V1\UserDirectoryController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1 — префикс /api/v1 задан в bootstrap/app.php
|--------------------------------------------------------------------------
| Аутентификация: cookie-сессии Sanctum (SPA на том же домене).
| Права: Policies (app/Policies). Rate limiters: AppServiceProvider.
*/

// --- Без входа -----------------------------------------------------------
// Middleware guest не используем: в API ему некуда перенаправлять. Повторный вход
// просто заменяет текущую сессию; SPA сама не показывает форму входа вошедшему.
Route::post('auth/login', [AuthenticatedSessionController::class, 'store'])
    ->middleware('throttle:login')
    ->name('auth.login');

Route::post('auth/forgot-password', [PasswordResetLinkController::class, 'store'])
    ->middleware('throttle:password-reset')
    ->name('auth.forgot-password');

Route::post('auth/reset-password', [NewPasswordController::class, 'store'])
    ->middleware('throttle:password-reset')
    ->name('auth.reset-password');

Route::middleware('throttle:invitations')->group(function () {
    Route::get('invitations/{token}', [InvitationAcceptanceController::class, 'show'])->name('invitations.show');
    Route::post('invitations/{token}/accept', [InvitationAcceptanceController::class, 'store'])->name('invitations.accept');
});

// --- Для вошедших пользователей -----------------------------------------
// tab-user: запрос от имени пользователя вкладки SPA (X-Selen-User), иначе 409 (ADR-0002, «Изменения»)
Route::middleware(['auth:sanctum', 'active', 'tab-user'])->group(function () {
    // Кто вошёл, сервер говорит сам; выйти можно из любой сессии — без сверки пользователя вкладки
    Route::get('auth/me', CurrentUserController::class)->withoutMiddleware('tab-user')->name('auth.me');
    Route::post('auth/logout', [AuthenticatedSessionController::class, 'destroy'])->withoutMiddleware('tab-user')->name('auth.logout');

    Route::patch('profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::put('profile/password', [ProfileController::class, 'updatePassword'])
        ->middleware('throttle:password-change')
        ->name('profile.password');

    // Дерево навигации пользователя: папки только с доступными ему пространствами (ADR-0013)
    Route::get('navigation', NavigationController::class)->name('navigation');

    // --- Пространства (доступ: только участники; чужое — 404, см. ADR-0005) ---
    Route::get('spaces', [SpaceController::class, 'index'])->name('spaces.index');
    Route::get('spaces/{space:key}', [SpaceController::class, 'show'])->name('spaces.show');
    Route::patch('spaces/{space:key}', [SpaceController::class, 'update'])->name('spaces.update');

    // Человек и группа в адресе ищутся среди людей и групп компании пространства (scopeBindings, ADR-0024)
    Route::get('spaces/{space:key}/members', [SpaceMemberController::class, 'index'])->name('spaces.members.index');
    Route::post('spaces/{space:key}/members', [SpaceMemberController::class, 'store'])->name('spaces.members.store');
    Route::patch('spaces/{space:key}/members/{user}', [SpaceMemberController::class, 'update'])->name('spaces.members.update')->scopeBindings();
    Route::delete('spaces/{space:key}/members/{user}', [SpaceMemberController::class, 'destroy'])->name('spaces.members.destroy')->scopeBindings();

    // Доступ групп к пространству (ADR-0012)
    Route::get('spaces/{space:key}/groups', [SpaceGroupController::class, 'index'])->name('spaces.groups.index');
    Route::post('spaces/{space:key}/groups', [SpaceGroupController::class, 'store'])->name('spaces.groups.store');
    Route::patch('spaces/{space:key}/groups/{group}', [SpaceGroupController::class, 'update'])->name('spaces.groups.update')->scopeBindings();
    Route::delete('spaces/{space:key}/groups/{group}', [SpaceGroupController::class, 'destroy'])->name('spaces.groups.destroy')->scopeBindings();

    // --- Доски, колонки, дорожки, карточки (те же правила доступа) ------
    Route::get('spaces/{space:key}/boards', [BoardController::class, 'index'])->name('boards.index');
    Route::post('spaces/{space:key}/boards', [BoardController::class, 'store'])->name('boards.store');
    Route::get('boards/{board}', [BoardController::class, 'show'])->name('boards.show');
    Route::patch('boards/{board}', [BoardController::class, 'update'])->name('boards.update');
    Route::post('boards/{board}/move', [BoardController::class, 'move'])->name('boards.move');
    Route::post('boards/{board}/archive', [BoardController::class, 'archive'])->name('boards.archive');
    Route::post('boards/{board}/restore', [BoardController::class, 'restore'])->name('boards.restore');
    Route::put('boards/{board}/collapsed', [BoardController::class, 'collapse'])->name('boards.collapse');
    Route::delete('boards/{board}/collapsed', [BoardController::class, 'expand'])->name('boards.expand');
    Route::get('boards/{board}/archived-cards', [BoardController::class, 'archivedCards'])->name('boards.archived-cards');

    Route::post('boards/{board}/columns', [BoardColumnController::class, 'store'])->name('columns.store');
    Route::patch('columns/{column}', [BoardColumnController::class, 'update'])->name('columns.update');
    Route::post('columns/{column}/move', [BoardColumnController::class, 'move'])->name('columns.move');
    Route::put('columns/{column}/category', [BoardColumnController::class, 'category'])->name('columns.category');
    Route::post('columns/{column}/archive', [BoardColumnController::class, 'archive'])->name('columns.archive');

    Route::post('boards/{board}/lanes', [LaneController::class, 'store'])->name('lanes.store');
    Route::patch('lanes/{lane}', [LaneController::class, 'update'])->name('lanes.update');
    Route::post('lanes/{lane}/move', [LaneController::class, 'move'])->name('lanes.move');
    Route::post('lanes/{lane}/archive', [LaneController::class, 'archive'])->name('lanes.archive');
    // Личное сворачивание дорожки (вид, не доступ, ADR-0019): строка есть — свёрнута
    Route::put('lanes/{lane}/collapsed', [LaneController::class, 'collapse'])->name('lanes.collapse');
    Route::delete('lanes/{lane}/collapsed', [LaneController::class, 'expand'])->name('lanes.expand');

    // Карточка адресуется номером: cards/DEV-123
    Route::post('boards/{board}/cards', [CardController::class, 'store'])->name('cards.store');
    Route::get('cards/{card}', [CardController::class, 'show'])->name('cards.show');
    Route::patch('cards/{card}', [CardController::class, 'update'])->name('cards.update');
    Route::delete('cards/{card}', [CardController::class, 'destroy'])->name('cards.destroy');
    Route::post('cards/{card}/move', [CardController::class, 'move'])->name('cards.move');
    Route::post('cards/{card}/archive', [CardController::class, 'archive'])->name('cards.archive');
    Route::post('cards/{card}/restore', [CardController::class, 'restore'])->name('cards.restore');
    Route::get('cards/{card}/transitions', [CardController::class, 'transitions'])->name('cards.transitions');
    Route::get('cards/{card}/history', [CardController::class, 'history'])->name('cards.history');
    Route::post('cards/{card}/participants', [CardParticipantController::class, 'store'])->name('cards.participants.store');
    Route::delete('cards/{card}/participants/{user}', [CardParticipantController::class, 'destroy'])->name('cards.participants.destroy')->scopeBindings();
    Route::put('cards/{card}/labels', [CardLabelController::class, 'update'])->name('cards.labels.update');
    Route::get('cards/{card}/mentionable', [CardController::class, 'mentionable'])->name('cards.mentionable');

    // Содержимое карточки: комментарии, чек-листы, ссылки, вложения (доступ — через карточку, ADR-0008)
    Route::get('cards/{card}/comments', [CommentController::class, 'index'])->name('comments.index');
    Route::post('cards/{card}/comments', [CommentController::class, 'store'])->name('comments.store');
    Route::patch('comments/{comment}', [CommentController::class, 'update'])->name('comments.update');
    Route::delete('comments/{comment}', [CommentController::class, 'destroy'])->name('comments.destroy');

    Route::post('cards/{card}/checklists', [ChecklistController::class, 'store'])->name('checklists.store');
    Route::patch('checklists/{checklist}', [ChecklistController::class, 'update'])->name('checklists.update');
    Route::delete('checklists/{checklist}', [ChecklistController::class, 'destroy'])->name('checklists.destroy');
    Route::post('checklists/{checklist}/items', [ChecklistController::class, 'storeItem'])->name('checklist-items.store');
    Route::patch('checklist-items/{item}', [ChecklistController::class, 'updateItem'])->name('checklist-items.update');
    Route::post('checklist-items/{item}/move', [ChecklistController::class, 'moveItem'])->name('checklist-items.move');
    Route::delete('checklist-items/{item}', [ChecklistController::class, 'destroyItem'])->name('checklist-items.destroy');

    Route::post('cards/{card}/links', [CardLinkController::class, 'store'])->name('card-links.store');
    Route::patch('card-links/{link}', [CardLinkController::class, 'update'])->name('card-links.update');
    Route::delete('card-links/{link}', [CardLinkController::class, 'destroy'])->name('card-links.destroy');

    Route::post('cards/{card}/attachments', [AttachmentController::class, 'store'])->name('attachments.store');
    // Файл грузит сам браузер (<img>, <video>, ссылка «скачать») — без заголовков, поэтому без сверки пользователя
    // вкладки (ADR-0002, «Изменения»); доступ к файлу проверяется правами пользователя сессии, действий нет
    Route::get('attachments/{attachment}', [AttachmentController::class, 'show'])->withoutMiddleware('tab-user')->name('attachments.show');
    Route::delete('attachments/{attachment}', [AttachmentController::class, 'destroy'])->name('attachments.destroy');

    // Связи и блокировки (ADR-0011); поиск карточек пространства для выбора связи — с учётом видимости
    Route::get('spaces/{space:key}/cards', CardSearchController::class)->name('cards.search');
    Route::post('cards/{card}/relations', [CardRelationController::class, 'store'])->name('card-relations.store');
    Route::delete('cards/{card}/relations/{relation}', [CardRelationController::class, 'destroy'])->name('card-relations.destroy');
    Route::post('cards/{card}/blocks', [CardBlockController::class, 'store'])->name('card-blocks.store');
    Route::post('card-blocks/{block}/resolve', [CardBlockController::class, 'resolve'])->name('card-blocks.resolve');

    // Метки: общие компании и метки пространства (изменение и архив — по одному маршруту для обоих)
    Route::get('spaces/{space:key}/labels', [LabelController::class, 'index'])->name('labels.index');
    Route::post('spaces/{space:key}/labels', [LabelController::class, 'store'])->name('labels.store');
    Route::patch('labels/{label}', [LabelController::class, 'update'])->name('labels.update');
    Route::post('labels/{label}/archive', [LabelController::class, 'archive'])->name('labels.archive');
    Route::post('labels/{label}/restore', [LabelController::class, 'restore'])->name('labels.restore');

    // Справочники для работы — по компании сущности (ADR-0024): люди и группы компании для выдачи доступа,
    // типы карточек — компании пространства
    Route::get('companies/{company}/users/directory', UserDirectoryController::class)->name('users.directory');
    Route::get('companies/{company}/groups/directory', GroupDirectoryController::class)->name('groups.directory');
    Route::get('spaces/{space:key}/card-types', [CardTypeController::class, 'index'])->name('card-types.index');

    // --- Администрирование компании (доступ проверяют Policies, ADR-0024) ----
    // Вложенные объекты ищутся только среди объектов компании из адреса (scoped binding: Company, Group, Space —
    // resolveChildRouteBinding): объект другой компании — 404, как несуществующий
    Route::prefix('admin/companies/{company}')->name('admin.')->scopeBindings()->group(function () {
        Route::get('users', [UserController::class, 'index'])->name('users.index');
        Route::patch('users/{user}/role', [UserController::class, 'updateRole'])->name('users.role');
        Route::post('users/{user}/deactivate', [UserController::class, 'deactivate'])->name('users.deactivate');
        Route::post('users/{user}/reactivate', [UserController::class, 'reactivate'])->name('users.reactivate');
        // Передача владения — с паролем, поэтому с лимитом, как смена пароля (ADR-0017)
        Route::post('users/{user}/transfer-ownership', [UserController::class, 'transferOwnership'])
            ->middleware('throttle:password-change')
            ->name('users.transfer-ownership');
        Route::get('users/{user}/access', [UserAccessController::class, 'access'])->name('users.access');
        Route::get('users/{user}/deactivation-impact', [UserAccessController::class, 'deactivationImpact'])->name('users.deactivation-impact');

        Route::get('groups', [AdminGroupController::class, 'index'])->name('groups.index');
        Route::post('groups', [AdminGroupController::class, 'store'])->name('groups.store');
        Route::get('groups/{group}', [AdminGroupController::class, 'show'])->name('groups.show');
        Route::patch('groups/{group}', [AdminGroupController::class, 'update'])->name('groups.update');
        Route::post('groups/{group}/archive', [AdminGroupController::class, 'archive'])->name('groups.archive');
        Route::post('groups/{group}/restore', [AdminGroupController::class, 'restore'])->name('groups.restore');
        Route::post('groups/{group}/members', [AdminGroupController::class, 'addMember'])->name('groups.members.store');
        Route::delete('groups/{group}/members/{user}', [AdminGroupController::class, 'removeMember'])->name('groups.members.destroy');
        Route::put('groups/{group}/spaces/{space}', [AdminGroupController::class, 'assignSpace'])->name('groups.spaces.assign');
        Route::delete('groups/{group}/spaces/{space}', [AdminGroupController::class, 'revokeSpace'])->name('groups.spaces.revoke');

        Route::get('invitations', [InvitationController::class, 'index'])->name('invitations.index');
        Route::post('invitations', [InvitationController::class, 'store'])->name('invitations.store');
        Route::post('invitations/{invitation}/resend', [InvitationController::class, 'resend'])->name('invitations.resend');
        Route::post('invitations/{invitation}/revoke', [InvitationController::class, 'revoke'])->name('invitations.revoke');

        Route::get('events', [EventLogController::class, 'index'])->name('events.index');

        Route::get('spaces', [AdminSpaceController::class, 'index'])->name('spaces.index');
        Route::post('spaces', [AdminSpaceController::class, 'store'])->name('spaces.store');
        Route::post('spaces/{space}/archive', [AdminSpaceController::class, 'archive'])->name('spaces.archive');
        Route::post('spaces/{space}/restore', [AdminSpaceController::class, 'restore'])->name('spaces.restore');
        Route::delete('spaces/{space}', [AdminSpaceController::class, 'destroy'])->name('spaces.destroy');
        Route::put('spaces/{space}/members/{user}', [AdminSpaceController::class, 'assignRole'])->name('spaces.assign-role');

        // Дерево навигации — «Структура» (ADR-0013)
        Route::get('navigation', [AdminNavigationController::class, 'index'])->name('navigation.index');
        Route::post('folders', [AdminNavigationController::class, 'storeFolder'])->name('folders.store');
        Route::post('folders/{node}/archive', [AdminNavigationController::class, 'archive'])->name('folders.archive');
        Route::post('folders/{node}/restore', [AdminNavigationController::class, 'restore'])->name('folders.restore');
        Route::delete('folders/{node}', [AdminNavigationController::class, 'destroyFolder'])->name('folders.destroy');
        Route::patch('nav-nodes/{node}', [AdminNavigationController::class, 'update'])->name('nav-nodes.update');
        Route::post('nav-nodes/{node}/move', [AdminNavigationController::class, 'move'])->name('nav-nodes.move');

        // Корзина карточек (ADR-0015): {key} — номер DEV-123; ищется после проверки прав (без привязки маршрута,
        // иначе по 403/404 можно перебирать номера)
        Route::get('trash/cards', [AdminTrashController::class, 'index'])->name('trash.index');
        Route::post('trash/cards/{key}/restore', [AdminTrashController::class, 'restore'])->name('trash.restore');

        Route::get('labels', [AdminLabelController::class, 'index'])->name('labels.index');
        Route::post('labels', [AdminLabelController::class, 'store'])->name('labels.store');

        Route::get('card-types', [AdminCardTypeController::class, 'index'])->name('card-types.index');
        Route::post('card-types', [AdminCardTypeController::class, 'store'])->name('card-types.store');
        Route::patch('card-types/{cardType}', [AdminCardTypeController::class, 'update'])->name('card-types.update');
        Route::post('card-types/{cardType}/archive', [AdminCardTypeController::class, 'archive'])->name('card-types.archive');
        Route::post('card-types/{cardType}/restore', [AdminCardTypeController::class, 'restore'])->name('card-types.restore');
    });
});
