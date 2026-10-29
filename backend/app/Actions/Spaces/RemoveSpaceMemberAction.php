<?php

namespace App\Actions\Spaces;

use App\Actions\Access\RevokeNodeAccessAction;
use App\Models\Space;
use App\Models\User;

/**
 * Исключить из пространства — снять все личные роли на самом пространстве (пользователь остаётся; унаследованные
 * с папок — на своей папке). Для мест без выбора узла: стенд PM и его тесты. Выдачи меняет RevokeNodeAccessAction.
 */
class RemoveSpaceMemberAction
{
    public function __construct(private readonly RevokeNodeAccessAction $revoke) {}

    public function handle(User $actor, Space $space, User $user): void
    {
        $this->revoke->handle($actor, $space->navNode, $user);
    }
}
