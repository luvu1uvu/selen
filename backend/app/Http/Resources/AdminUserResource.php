<?php

namespace App\Http\Resources;

use App\Enums\UserStatus;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Access\CompanyMembers;
use Illuminate\Http\Request;

/**
 * Пользователь в админке «Пользователи»: статус в этой компании, гость со сроком, отключён ли Владельцем (П2c), плюс
 * подсказки интерфейсу, какие действия доступны текущему администратору (UserPolicy, ADR-0017). Реальную проверку
 * всегда делает сервер.
 *
 * @mixin User
 */
class AdminUserResource extends UserResource
{
    /**
     * Человек компании из адреса админки: role — его роль в этой компании (owner | admin | member, ADR-0024),
     * permissions — что текущий администратор может с ним сделать в этой компании (UserPolicy).
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $actor */
        $actor = $request->user();
        /** @var Company $company */
        $company = $request->route('company');
        $user = $this->resource;

        $account = $this->account($company->roleOf($user));
        // Статус — в этой компании (П2c): убранный из неё — «Деактивирован», даже если работает в другой
        $account['status'] = CompanyMembers::statusOf($user, $company->id);
        $account['deactivated_at'] = CompanyMembers::deactivatedAt($user, $company->id)?->toIso8601ZuluString();
        $guest = CompanyMembers::guestOf($user, $company->id);
        // Время входов и активности и часовой пояс — только действующим сотрудникам компании (минимум ПДн, аудит П2b-2,
        // S-3): Владелец вне его «домов», гость и убранный из компании по ним выдали бы, что человек работает где-то ещё
        if (($user->isOwner() || $account['status'] === UserStatus::Deactivated || $guest !== null)
            && ! CompanyMembers::isActiveHome($user, $company->id)) {
            $account = ['last_login_at' => null, 'last_seen_at' => null, 'timezone' => null] + $account;
        }
        $canChangeEmail = $guest === null && $actor->can('changeEmail', [$user, $company]);
        $emailChange = $canChangeEmail ? $user->emailChangeRequest : null;

        return $account + [
            // Гость компании: срок (null — без срока), истёк ли (П2c)
            'guest' => $guest === null ? null : [
                'expires_at' => $guest['expires_at']?->toIso8601ZuluString(),
                'expired' => $guest['expired'],
            ],
            // Учётную запись отключил Владелец (вернуть может только он)
            'blocked' => $user->isBlocked(),
            // Новый email ждёт подтверждения по ссылке (П2c-2) — тем, кто может менять email
            'email_change' => $emailChange === null ? null : [
                'email' => $emailChange->new_email,
                'expires_at' => $emailChange->expires_at->toIso8601ZuluString(),
                'expired' => $emailChange->isExpired(),
            ],
            'permissions' => [
                'update_role' => $guest === null && $actor->can('updateRole', [$user, $company]),
                'deactivate' => $guest === null && $actor->can('deactivate', [$user, $company]),
                'reactivate' => $guest === null && $actor->can('reactivate', [$user, $company]),
                // Повторить или отозвать приглашение пользователя (InvitationPolicy::manages)
                'manage_invitation' => $guest === null && $actor->can('manages', [Invitation::class, $user, $company]),
                'transfer_ownership' => $guest === null && $actor->can('transferOwnership', [$user, $company]),
                'block' => $guest === null && $actor->can('block', [$user, $company]),
                // Деактивация с передачей доступа преемнику — Владелец и администратор компании
                'transfer_access' => $guest === null && $actor->can('transferAccess', [$user, $company]),
                // Гостей ведут только в копии с несколькими компаниями (ADR-0026): иначе их маршруты — 404
                'manage_guest' => $guest !== null && config('selen.multi_company') && $actor->can('manageGuests', [User::class, $company]),
                'manage_permissions' => $guest === null && $actor->can('managePermissions', [$user, $company]),
                // «Завершить все сеансы» и смена email (П2c-2)
                'terminate_sessions' => $guest === null && $actor->can('terminateSessions', [$user, $company]),
                'change_email' => $canChangeEmail,
            ],
        ];
    }
}
