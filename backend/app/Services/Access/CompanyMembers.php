<?php

namespace App\Services\Access;

use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Date;

/**
 * Статус человека в компании для показа (docs/adr/0024-rights-2.md, П2c): бейдж «Деактивирован» на карточках,
 * в «Людях», группах и админке — по компании пространства, а не по учётной записи. Иначе администратор компании A по
 * бейджу «активен» у убранного из A человека узнал бы, что тот работает в другой компании. Гость — отдельно (бейдж).
 *
 * Членства компании читаются одним запросом на компанию за HTTP-запрос (кеш — в атрибутах запроса: новый запрос — новые
 * данные). Права — только AccessResolver; здесь — только показ.
 */
final class CompanyMembers
{
    /**
     * invited | active | deactivated в этой компании: деактивирован — учётная запись отключена или без «домов»,
     * убран из компании, гостю истёк срок, не участник компании (бывший гость, бывший Владелец); Владелец — активен.
     */
    public static function statusOf(User $user, string $companyId): UserStatus
    {
        if ($user->isOwner() || $user->status === UserStatus::Deactivated) {
            return $user->status;
        }

        $membership = self::of($companyId)->get($user->id);
        $inactive = $membership === null || $membership->deactivated_at !== null || self::expired($membership);

        return $inactive ? UserStatus::Deactivated : $user->status;
    }

    /**
     * Смотрит ли человек на компанию как гость (решение PM 28.10 по аудиту П2c-1, вопрос 1): гостю люди компании-хозяина —
     * только по имени, без email, группы — без названий.
     */
    public static function viewsAsGuest(User $viewer, string $companyId): bool
    {
        return ! $viewer->isOwner() && self::of($companyId)->get($viewer->id)?->kind === AccessResolver::GUEST;
    }

    /** Действующий «дом» этой компании (без запроса — из тех же членств). */
    public static function isActiveHome(User $user, string $companyId): bool
    {
        $membership = self::of($companyId)->get($user->id);

        return $membership?->kind === AccessResolver::HOME && $membership->deactivated_at === null;
    }

    /** С какого момента человек деактивирован в этой компании (убран из неё или учётная запись); null — не деактивирован. */
    public static function deactivatedAt(User $user, string $companyId): ?Carbon
    {
        $membership = self::of($companyId)->get($user->id);
        // У гостя — не показываем: время деактивации его учётной записи выдало бы, когда он ушёл из своей компании
        // (аудит П2c-1, S-6)
        if ($membership?->kind === AccessResolver::GUEST) {
            return null;
        }
        $removed = $membership?->deactivated_at === null ? null : Date::parse($membership->deactivated_at);

        return $removed ?? (self::statusOf($user, $companyId) === UserStatus::Deactivated ? $user->deactivated_at : null);
    }

    /**
     * Гость компании: срок (null — без срока) и истёк ли; null — не гость.
     *
     * @return array{expires_at: Carbon|null, expired: bool}|null
     */
    public static function guestOf(User $user, string $companyId): ?array
    {
        $membership = self::of($companyId)->get($user->id);
        if ($membership?->kind !== AccessResolver::GUEST) {
            return null;
        }

        return [
            'expires_at' => $membership->expires_at === null ? null : Date::parse($membership->expires_at),
            'expired' => self::expired($membership),
        ];
    }

    private static function expired(\stdClass $membership): bool
    {
        return $membership->kind === AccessResolver::GUEST && $membership->expires_at !== null
            && Date::parse($membership->expires_at)->lte(Date::now());
    }

    /** @return Collection<string, \stdClass> */
    private static function of(string $companyId): Collection
    {
        $attributes = request()->attributes;
        $key = "selen.company_members.{$companyId}";
        if (! $attributes->has($key)) {
            $attributes->set($key, app(AccessResolver::class)->membershipsOf($companyId));
        }

        /** @var Collection<string, \stdClass> */
        return $attributes->get($key);
    }
}
