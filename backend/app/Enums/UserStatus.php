<?php

namespace App\Enums;

enum UserStatus: string
{
    /** Приглашён, но ещё не задал пароль. */
    case Invited = 'invited';

    /** Может входить в систему. */
    case Active = 'active';

    /** Доступ закрыт. Пользователей не удаляем: на них ссылаются история и (позже) карточки. */
    case Deactivated = 'deactivated';
}
