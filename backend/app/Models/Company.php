<?php

namespace App\Models;

use App\Enums\CompanyRole;
use App\Enums\UserRole;
use App\Services\Access\AccessResolver;
use App\Services\Access\CompanyAccess;
use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Компания — обособленная команда внутри Selen (docs/adr/0024-rights-2.md): свои дерево (папки и пространства), группы
 * со своей «Все сотрудники», метки, типы карточек, приглашения и журнал. Человек связан с компанией членством
 * (company_members): «дом» — полноправный сотрудник. Права в компании — только из permissionsOf() (AccessResolver).
 * Компании не удаляются и не архивируются; создаёт и переименовывает их только Владелец (П2b-2).
 *
 * Объекты админки ищутся только среди объектов компании из адреса (scoped binding, admin/companies/{company}/…):
 * связи ниже — это и есть привязка «объект этой компании», чужой объект — 404.
 *
 * @property string $id
 * @property string $name
 * @property string|null $created_by
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, User> $users
 */
#[Fillable(['name'])]
class Company extends Model
{
    /** @use HasFactory<CompanyFactory> */
    use HasFactory, HasUlids;

    /**
     * Права компании, уже вычисленные в рамках запроса (как Space::accessOf — кеш на экземпляре).
     *
     * @var array<string, CompanyAccess>
     */
    private array $resolvedPermissions = [];

    /**
     * Люди компании — её «дома» (членство; права — только через permissionsOf()).
     *
     * @return BelongsToMany<User, $this>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_members')->withPivot(['kind', 'is_admin'])
            ->wherePivot('kind', AccessResolver::HOME)
            ->withTimestamps();
    }

    /** @return HasMany<Space, $this> */
    public function spaces(): HasMany
    {
        return $this->hasMany(Space::class);
    }

    /**
     * Узлы дерева навигации компании (папки и пространства).
     *
     * @return HasMany<NavNode, $this>
     */
    public function nodes(): HasMany
    {
        return $this->hasMany(NavNode::class);
    }

    /** @return HasMany<Group, $this> */
    public function groups(): HasMany
    {
        return $this->hasMany(Group::class);
    }

    /** @return HasMany<Label, $this> */
    public function labels(): HasMany
    {
        return $this->hasMany(Label::class);
    }

    /** @return HasMany<CardType, $this> */
    public function cardTypes(): HasMany
    {
        return $this->hasMany(CardType::class);
    }

    /** @return HasMany<Invitation, $this> */
    public function invitations(): HasMany
    {
        return $this->hasMany(Invitation::class);
    }

    /** Встроенная группа «Все сотрудники» этой компании (состав — её действующие «дома»). */
    public function everyoneGroup(): Group
    {
        return $this->groups()->where('system_key', Group::EVERYONE)->firstOrFail();
    }

    /**
     * Первая компания — «Компания 1» перехода (ADR-0024). В неё консольные команды без выбора компании (make admin,
     * стенд PM) и демо-данные добавляют людей и пространства.
     */
    public static function primary(): self
    {
        return self::query()->orderBy('created_at')->orderBy('id')->firstOrFail();
    }

    /**
     * Права пользователя в компании: участник ли он, администратор ли и какие права компании у него есть.
     * Единственный вход для политик админки; вычисляется один раз на экземпляр.
     */
    public function permissionsOf(User $user): CompanyAccess
    {
        return $this->resolvedPermissions[(string) $user->getKey()]
            ??= app(AccessResolver::class)->forCompany($user, $this);
    }

    /** Запомнить уже вычисленные права (списки людей читают права всех одним запросом). */
    public function rememberPermissions(User $user, CompanyAccess $access): void
    {
        $this->resolvedPermissions[(string) $user->getKey()] = $access;
    }

    /** Роль человека в компании для показа: owner | admin | member (права — только permissionsOf()). */
    public function roleOf(User $user): string
    {
        return $user->isOwner() ? UserRole::Owner->value : CompanyRole::of($this->permissionsOf($user)->isAdmin())->value;
    }

    /**
     * Вложенный объект адреса admin/companies/{company}/… (scoped binding): человек — её «дом» или Владелец (участник
     * всех компаний, ADR-0024: его доступ в компании видно и выдать можно); остальное — среди объектов компании (связи).
     */
    public function resolveChildRouteBinding($childType, $value, $field): ?Model
    {
        if ($childType === 'user') {
            return User::query()
                ->whereIn('id', app(AccessResolver::class)->companyPeopleIds($this))
                ->where($field ?? 'id', $value)
                ->first();
        }

        return parent::resolveChildRouteBinding($childType, $value, $field);
    }

    /** Сбросить кеш прав (после смены администратора в этом же запросе). */
    public function forgetResolvedPermissions(): void
    {
        $this->resolvedPermissions = [];
    }
}
