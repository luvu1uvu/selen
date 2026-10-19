<?php

namespace App\Services\Access;

use App\Enums\SpaceRole;
use Closure;

/**
 * Итоговые права пользователя в пространстве — набор действующих источников (docs/adr/0012-groups.md).
 *
 * Главное правило: действие разрешено, если его ЦЕЛИКОМ разрешает хотя бы один источник. Роль одного
 * источника не сочетается с ограничением другого: личный commenter без ограничения и группа editor
 * с «только своими карточками» — видит все карточки, а редактирует только свои.
 *
 * Объект строит только SpaceAccessResolver; читают его политики (ChecksSpaceRole), CardVisibility и ресурсы.
 */
final readonly class SpaceAccess
{
    /**
     * @param  list<AccessSource>  $sources  только действующие источники
     */
    public function __construct(public array $sources = []) {}

    public static function none(): self
    {
        return new self;
    }

    /** Есть ли у пользователя хоть какой-то доступ к пространству. */
    public function isMember(): bool
    {
        return $this->sources !== [];
    }

    /** Видит ли все карточки: хотя бы один источник без режима «только свои карточки». */
    public function canSeeAllCards(): bool
    {
        return $this->any(fn (AccessSource $source) => ! $source->ownCardsOnly);
    }

    /** Режим «только свои карточки» действует: доступ есть, но все источники с ограничением. */
    public function isRestricted(): bool
    {
        return $this->isMember() && ! $this->canSeeAllCards();
    }

    /**
     * Действие в пространстве без конкретной карточки (структура, участники, создание карточки).
     *
     * @param  callable(SpaceRole): bool  $permits
     */
    public function allows(callable $permits): bool
    {
        return $this->any(fn (AccessSource $source) => $permits($source->role));
    }

    /**
     * Действие с конкретной карточкой: источник должен разрешать роль и (не иметь ограничения или
     * карточка «своя»). $involves вычисляется лениво — только если встретился источник с ограничением.
     *
     * @param  callable(SpaceRole): bool  $permits
     * @param  Closure(): bool  $involves
     */
    public function allowsOnCard(callable $permits, Closure $involves): bool
    {
        $involved = null;

        return $this->any(function (AccessSource $source) use ($permits, $involves, &$involved) {
            if (! $permits($source->role)) {
                return false;
            }

            return ! $source->ownCardsOnly || ($involved ??= $involves());
        });
    }

    /** Самая сильная роль среди источников — только для показа (my_role); права — через allows*(). */
    public function highestRole(): ?SpaceRole
    {
        $roles = array_map(fn (AccessSource $source) => $source->role, $this->sources);

        foreach ([SpaceRole::Admin, SpaceRole::Editor, SpaceRole::Commenter] as $role) {
            if (in_array($role, $roles, true)) {
                return $role;
            }
        }

        return null;
    }

    /** Личное участие, если оно есть. */
    public function personal(): ?AccessSource
    {
        foreach ($this->sources as $source) {
            if ($source->isPersonal()) {
                return $source;
            }
        }

        return null;
    }

    /** @param  callable(AccessSource): bool  $check */
    private function any(callable $check): bool
    {
        foreach ($this->sources as $source) {
            if ($check($source)) {
                return true;
            }
        }

        return false;
    }
}
