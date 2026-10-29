<?php

namespace App\Actions\Invitations;

use App\Actions\Access\SetNodeAccessAction;
use App\Enums\CompanyRole;
use App\Enums\EventType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use App\Notifications\AccessOpenedNotification;
use App\Notifications\InvitationNotification;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyMemberships;
use App\Services\Auth\AccountStatus;
use App\Services\EventLog\EventRecorder;
use App\Services\Invitations\InvitationIssuer;
use App\Services\Invitations\IssuedInvitation;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Приглашение в компанию (ADR-0004, ADR-0024):
 * - новый email — пользователь invited, его «дом» в компании (администратор компании — с ролью admin) и приглашение
 *   с одноразовым токеном;
 * - email существующей учётной записи (П2c, решение PM 23.10, В8) — сразу «дом» в компании без регистрации («Сотрудник
 *   добавлен»); гость этой компании становится её сотрудником; ещё не задавшему пароль — новое приглашение. Уже
 *   сотрудник или деактивирован здесь — 422 (это своя компания, ничего нового администратор не узнаёт). В режиме
 *   «одна компания» (ADR-0026) второго «дома» нет: человек другой компании (бывает, только если компаний в базе
 *   несколько) — 422, гость этой компании сотрудником не становится.
 * Сразу — доступ к выбранным пространствам с ролью (аудит Kaiten; право выдавать проверил Form Request).
 * Письмо одно для всех, без названия компании (решение PM 28.10, п. 3) — после фиксации транзакции.
 */
class InviteUserAction
{
    public const VIA = 'invitation';

    public function __construct(
        private readonly EventRecorder $events,
        private readonly InvitationIssuer $issuer,
        private readonly AccessResolver $resolver,
        private readonly CompanyMemberships $memberships,
        private readonly AccountStatus $accountStatus,
        private readonly SetNodeAccessAction $setAccess,
    ) {}

    /**
     * @param  list<array{node: NavNode, roles: list<Role>}>  $grants  доступ к папкам и пространствам (П2d-1)
     */
    public function handle(User $inviter, Company $company, string $name, string $email, CompanyRole $role, array $grants = []): InviteResult
    {
        /** @var array{InviteResult, IssuedInvitation|null} $outcome */
        $outcome = DB::transaction(function () use ($inviter, $company, $name, $email, $role, $grants) {
            $user = User::query()->where('email', mb_strtolower(trim($email)))->lockForUpdate()->first();

            [$result, $issued] = $user === null
                ? $this->inviteNew($inviter, $company, $name, $email, $role)
                : $this->addExisting($inviter, $company, $user, $role);

            $this->grantAccess($inviter, $result->user, $grants);

            return [$result, $issued];
        });

        [$result, $issued] = $outcome;
        // Отключённому Владельцем письмо не нужно — войти и принять приглашение он не может (аудит П2c-1, S-5)
        if ($result->user->isBlocked()) {
            return $result;
        }
        $result->user->notify($issued === null
            ? new AccessOpenedNotification
            : new InvitationNotification($issued->invitation, $issued->token));

        return $result;
    }

    /** @return array{InviteResult, IssuedInvitation} */
    private function inviteNew(User $inviter, Company $company, string $name, string $email, CompanyRole $role): array
    {
        try {
            $user = User::query()->create([
                'name' => $name,
                'email' => $email,
                'role' => UserRole::Member,
                'status' => UserStatus::Invited,
                'timezone' => config('selen.default_timezone'),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Тот же email пригласили одновременно (новую строку нечем заблокировать заранее)
            throw ValidationException::withMessages(['email' => __('selen.invitations.concurrent')]);
        }
        $this->memberships->addHome($company, $user, $role === CompanyRole::Admin);

        $issued = $this->issueInvitation($inviter, $company, $user, $role);

        return [new InviteResult(InviteResult::INVITED, $user, $issued->invitation), $issued];
    }

    /** @return array{InviteResult, IssuedInvitation|null} */
    private function addExisting(User $inviter, Company $company, User $user, CompanyRole $role): array
    {
        $membership = $this->resolver->membership($company, $user, lock: true);
        if ($user->isOwner() || ($membership?->kind === AccessResolver::HOME && $membership->deactivated_at === null)) {
            throw ValidationException::withMessages(['email' => __('selen.invitations.already_member')]);
        }
        if ($membership?->kind === AccessResolver::HOME) {
            throw ValidationException::withMessages(['email' => __('selen.invitations.deactivated_here')]);
        }
        if (! config('selen.multi_company')) {
            throw ValidationException::withMessages(['email' => __('selen.invitations.other_company')]);
        }

        // Гость этой компании становится сотрудником (его выдачи остаются); иначе — новый «дом»
        $this->memberships->addHome($company, $user, $role === CompanyRole::Admin);
        // Учётная запись без действующих «домов» снова может войти (если её не отключил Владелец)
        $this->accountStatus->sync($user);

        // Пароль ещё не задан (приглашён в другую компанию и не принял) — своё приглашение и ссылка задать пароль
        if (! $user->hasActivated()) {
            $issued = $this->issueInvitation($inviter, $company, $user, $role);

            return [new InviteResult(InviteResult::INVITED, $user, $issued->invitation), $issued];
        }

        $this->events->record(EventType::UserAddedToCompany, $inviter, $user, ['role' => $role->value], company: $company);

        return [new InviteResult(InviteResult::ADDED, $user), null];
    }

    private function issueInvitation(User $inviter, Company $company, User $user, CompanyRole $role): IssuedInvitation
    {
        $issued = $this->issuer->issue($company, $user, $inviter);

        $this->events->record(EventType::UserInvited, $inviter, $user, [
            'invitation_id' => $issued->invitation->id,
            'role' => $role->value,
            'expires_at' => $issued->invitation->expires_at->toIso8601ZuluString(),
        ], company: $company);

        return $issued;
    }

    /**
     * Роли на папках и пространствах — ровно выбранные (где у него уже были роли — заменяются, как прежде).
     *
     * @param  list<array{node: NavNode, roles: list<Role>}>  $grants
     */
    private function grantAccess(User $inviter, User $user, array $grants): void
    {
        foreach ($grants as $grant) {
            $this->setAccess->handle($inviter, $grant['node'], $user, $grant['roles'], self::VIA);
        }
    }
}
