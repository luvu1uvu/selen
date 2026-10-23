<?php

namespace App\Actions\PmStand;

use App\Actions\Auth\ChangePasswordAction;
use App\Actions\Spaces\AddSpaceMemberAction;
use App\Actions\Users\CreateServiceUserAction;
use App\Enums\SpaceRole;
use App\Models\Space;
use App\Models\User;
use App\Services\PmStand\PmStand;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * QA-бот стенда PM: обычный сотрудник, editor в пространстве LATER, других доступов ему не выдаём.
 * Пароль — из .env стенда; повторный запуск приводит пароль к нему и ничего не дублирует.
 * В участники LATER бота добавляет PM — у бота нет права управлять участниками.
 */
class SetUpQaBotAction
{
    public function __construct(
        private readonly CreateServiceUserAction $createUser,
        private readonly ChangePasswordAction $changePassword,
        private readonly AddSpaceMemberAction $addMember,
    ) {}

    public function handle(User $owner, Space $space, string $email, #[\SensitiveParameter] string $password): User
    {
        return DB::transaction(function () use ($owner, $space, $email, $password) {
            $email = mb_strtolower(trim($email));
            $bot = User::query()->where('email', $email)->first();

            if ($bot === null) {
                $bot = $this->createUser->handle($space->company, PmStand::BOT_NAME, $email, $password);
            } else {
                // Бот — обычный активный сотрудник компании стенда (ADR-0024: администраторы — у компаний)
                $inCompany = $space->company->permissionsOf($bot);
                if ($bot->isOwner() || $inCompany->isAdmin() || ! $inCompany->isMember() || ! $bot->isActive()) {
                    throw ValidationException::withMessages([
                        'email' => "{$email} — не обычный активный сотрудник: QA-ботом быть не может.",
                    ]);
                }
                if (! Hash::check($password, $bot->password)) {
                    $this->changePassword->handle($bot, $password, null);
                }
            }

            $role = $space->roleOf($bot);
            if ($role === null) {
                $this->addMember->handle($owner, $space, $bot, SpaceRole::Editor);
            } elseif ($role !== SpaceRole::Editor) {
                throw ValidationException::withMessages([
                    'role' => "QA-бот уже в {$space->key} с ролью «{$role->value}» — нужна editor, поправьте в участниках.",
                ]);
            }

            return $bot;
        });
    }
}
