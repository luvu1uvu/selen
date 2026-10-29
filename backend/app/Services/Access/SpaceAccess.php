<?php

namespace App\Services\Access;

use App\Enums\Permission;
use App\Enums\SpaceRole;
use Closure;

/**
 * Итоговые права пользователя в пространстве (или на папке, NavNode::accessOf) — набор действующих источников:
 * выдачи на сам узел и унаследованные с папок выше (ADR-0012, ADR-0024).
 *
 * Главное правило: действие разрешено, если его ЦЕЛИКОМ разрешает хотя бы один источник. Права роли одного
 * источника не сочетаются с областью карточек другого: личный «Комментатор» и группа «Редактор — только свои
 * карточки» — видит все карточки, а редактирует только свои.
 *
 * Объект строит только AccessResolver; читают его политики (ChecksSpaceRole), CardVisibility и ресурсы.
 * Права — из каталога (App\Enums\Permission), не названия ролей.
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

    /** Есть ли у пользователя хоть какой-то доступ к пространству (чтение входит в любую роль). */
    public function isMember(): bool
    {
        return $this->sources !== [];
    }

    /** Видит ли все карточки: хотя бы один источник с областью «все карточки». */
    public function canSeeAllCards(): bool
    {
        return $this->any(fn (AccessSource $source) => $source->seesAllCards());
    }

    /** Режим «только свои карточки» действует: доступ есть, но у всех источников область «свои». */
    public function isRestricted(): bool
    {
        return $this->isMember() && ! $this->canSeeAllCards();
    }

    /** Действие в пространстве без конкретной карточки (структура, доступ, доски, создание карточки). */
    public function allows(Permission $permission): bool
    {
        return $this->any(fn (AccessSource $source) => $source->permits($permission));
    }

    /**
     * Действие с конкретной карточкой: право и карточку даёт один и тот же источник — у него есть право и
     * (область «все карточки» или карточка «своя»). $involves вычисляется лениво — только если встретился
     * источник с правом и областью «свои».
     *
     * @param  Closure(): bool  $involves
     */
    public function allowsOnCard(Permission $permission, Closure $involves): bool
    {
        $involved = null;

        return $this->any(function (AccessSource $source) use ($permission, $involves, &$involved) {
            if (! $source->permits($permission)) {
                return false;
            }

            return $source->seesAllCards() || ($involved ??= $involves());
        });
    }

    /** Самая сильная роль API среди источников — только для показа (my_role); права — через allows*(). */
    public function highestRole(): ?SpaceRole
    {
        $roles = array_map(fn (AccessSource $source) => $source->legacyRole(), $this->sources);

        foreach ([SpaceRole::Admin, SpaceRole::Editor, SpaceRole::Commenter] as $role) {
            if (in_array($role, $roles, true)) {
                return $role;
            }
        }

        return null;
    }

    /**
     * Личные выдачи на сам узел (не унаследованные) — у субъекта на узле может быть несколько ролей (П2d-1).
     *
     * @return list<AccessSource>
     */
    public function personalSources(): array
    {
        return array_values(array_filter($this->sources, fn (AccessSource $source) => $source->isPersonal() && ! $source->isInherited()));
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
