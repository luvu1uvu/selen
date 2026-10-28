<?php

namespace App\Models;

use App\Enums\Theme;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Notifications\ResetPasswordNotification;
use App\Services\Access\AccessResolver;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $name
 * @property string $email
 * @property string|null $password
 * @property UserRole $role
 * @property UserStatus $status
 * @property string $timezone
 * @property Theme $theme
 * @property Carbon|null $last_login_at
 * @property Carbon|null $deactivated_at
 * @property Carbon|null $blocked_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Invitation|null $latestInvitation
 * @property-read Collection<int, Company> $companies
 * @property-read Collection<int, Group> $groups
 * @property-read Collection<int, Lane> $collapsedLanes
 * @property-read Collection<int, Board> $collapsedBoards
 */
#[Fillable(['name', 'email', 'password', 'role', 'status', 'timezone'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasUlids, Notifiable;

    /** @var array<string, mixed> */
    protected $attributes = [
        'role' => 'member',
        'status' => 'invited',
        'timezone' => 'Europe/Moscow',
        'theme' => 'light',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => UserRole::class,
            'status' => UserStatus::class,
            'theme' => Theme::class,
            'last_login_at' => 'datetime',
            'deactivated_at' => 'datetime',
            'blocked_at' => 'datetime',
        ];
    }

    /**
     * Email всегда храним в нижнем регистре без пробелов по краям.
     *
     * @return Attribute<string, string>
     */
    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value) => mb_strtolower(trim($value)));
    }

    /** @return HasMany<Invitation, $this> */
    public function invitations(): HasMany
    {
        return $this->hasMany(Invitation::class);
    }

    /**
     * Последнее приглашение (ULID упорядочены по времени создания).
     *
     * @return HasOne<Invitation, $this>
     */
    public function latestInvitation(): HasOne
    {
        return $this->hasOne(Invitation::class)->latestOfMany();
    }

    /**
     * Группы пользователя (состав; права — только через AccessResolver, ADR-0012).
     *
     * @return BelongsToMany<Group, $this>
     */
    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(Group::class, 'group_members')->withPivot(['added_by', 'created_at']);
    }

    /**
     * Дорожки, которые пользователь у себя свернул (личный вид, ADR-0019; права и выборки карточек не меняет).
     *
     * @return BelongsToMany<Lane, $this>
     */
    public function collapsedLanes(): BelongsToMany
    {
        return $this->belongsToMany(Lane::class, 'collapsed_lanes');
    }

    /**
     * Доски, которые пользователь у себя свернул на странице пространства (личный вид, ADR-0019).
     *
     * @return BelongsToMany<Board, $this>
     */
    public function collapsedBoards(): BelongsToMany
    {
        return $this->belongsToMany(Board::class, 'collapsed_boards');
    }

    /**
     * Компании, где пользователь — «дом» (членство, ADR-0024; убранный из компании — с deactivated_at; права в компании —
     * только Company::permissionsOf()).
     *
     * @return BelongsToMany<Company, $this>
     */
    public function companies(): BelongsToMany
    {
        return $this->belongsToMany(Company::class, 'company_members')->withPivot(['kind', 'is_admin', 'deactivated_at'])
            ->wherePivot('kind', AccessResolver::HOME)
            ->withTimestamps();
    }

    /** Учётную запись отключил Владелец (П2c): вход закрыт, вернуть может только он. */
    public function isBlocked(): bool
    {
        return $this->blocked_at !== null;
    }

    /**
     * Управляет ли компанией как администратор: Владелец — всеми, администратор компании — своей (ADR-0024;
     * frontend — adminCompanies). Глобального системного администратора нет.
     */
    public function administers(Company $company): bool
    {
        return $company->permissionsOf($this)->isAdmin();
    }

    /** Владелец — единственный в системе (ограничения БД и политики, ADR-0017); участник всех компаний. */
    public function isOwner(): bool
    {
        return $this->role === UserRole::Owner;
    }

    public function isDeactivated(): bool
    {
        return $this->status === UserStatus::Deactivated;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::Active;
    }

    /** Пользователь хотя бы раз активировал учётную запись (задал пароль). */
    public function hasActivated(): bool
    {
        return $this->password !== null;
    }

    /** Письмо со ссылкой на страницу сброса пароля в SPA (через очередь). */
    public function sendPasswordResetNotification(#[\SensitiveParameter] $token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }
}
