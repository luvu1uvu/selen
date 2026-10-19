<?php

namespace App\Providers;

use App\Models\Attachment;
use App\Models\Board;
use App\Models\BoardColumn;
use App\Models\Card;
use App\Models\CardType;
use App\Models\Comment;
use App\Models\EventLogEntry;
use App\Models\Group;
use App\Models\Invitation;
use App\Models\Label;
use App\Models\Lane;
use App\Models\NavNode;
use App\Models\Space;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /** Право смотреть аналитику трудозатрат сотрудников (этап 9). */
    public const VIEW_WORK_TIME_ANALYTICS = 'view-work-time-analytics';

    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Строгий режим Eloquent в dev и тестах: ловим N+1 и опечатки в mass assignment
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        // В production (сервер и стенд PM) migrate:fresh, db:wipe и прочие стирающие базу команды запрещены
        DB::prohibitDestructiveCommands($this->app->isProduction());

        // Короткие имена моделей в полиморфных связях и журнале событий (subject_type)
        Relation::enforceMorphMap([
            'user' => User::class,
            'invitation' => Invitation::class,
            'event_log_entry' => EventLogEntry::class,
            'space' => Space::class,
            'card_type' => CardType::class,
            'board' => Board::class,
            'column' => BoardColumn::class,
            'lane' => Lane::class,
            'card' => Card::class,
            'label' => Label::class,
            'comment' => Comment::class,
            'attachment' => Attachment::class,
            'group' => Group::class,
            'nav_node' => NavNode::class,
        ]);

        // Политика паролей: одинакова для приглашения, сброса и смены пароля.
        // Проверку по базам утечек (uncompromised) не включаем: она обращается к внешнему сервису.
        Password::defaults(fn () => Password::min((int) config('selen.password_min_length'))->max(255));

        $this->configureRateLimiting();

        // Аналитика трудозатрат (этап 9) — только Владельцу (ADR-0017). Маршруты этапа 9 закрываются этой
        // проверкой: Gate::authorize(AppServiceProvider::VIEW_WORK_TIME_ANALYTICS)
        Gate::define(self::VIEW_WORK_TIME_ANALYTICS, fn (User $user) => $user->isOwner());
    }

    private function configureRateLimiting(): void
    {
        $tooMany = fn (string $key) => fn (Request $request, array $headers): JsonResponse => response()->json(
            ['message' => __($key, ['seconds' => $headers['Retry-After'] ?? 60])],
            429,
            $headers,
        );

        // Вход: 5 попыток в минуту на пару email + IP, 20 в минуту на IP и 10 в минуту на email с любых адресов —
        // перебор пароля одной учётной записи не ускоряется сменой IP (LATER-61, ADR-0021)
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)
                ->by(mb_strtolower((string) $request->input('email')).'|'.$request->ip())
                ->response($tooMany('auth.throttle')),
            Limit::perMinute(20)->by('ip:'.$request->ip())->response($tooMany('auth.throttle')),
            Limit::perMinute(10)
                ->by('email:'.mb_strtolower((string) $request->input('email')))
                ->response($tooMany('auth.throttle')),
        ]);

        // Сброс пароля: 3 запроса в минуту на email, 10 в минуту на IP
        RateLimiter::for('password-reset', fn (Request $request) => [
            Limit::perMinute(3)
                ->by(mb_strtolower((string) $request->input('email')))
                ->response($tooMany('selen.throttle')),
            Limit::perMinute(10)->by('ip:'.$request->ip())->response($tooMany('selen.throttle')),
        ]);

        // Смена пароля из профиля: защита от перебора текущего пароля
        RateLimiter::for('password-change', fn (Request $request) => Limit::perMinute(6)
            ->by((string) $request->user()?->getAuthIdentifier())
            ->response($tooMany('selen.throttle')));

        // Страница приглашения: защита от перебора токенов
        RateLimiter::for('invitations', fn (Request $request) => Limit::perMinute(20)
            ->by($request->ip())
            ->response($tooMany('selen.throttle')));
    }
}
