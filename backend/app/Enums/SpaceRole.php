<?php

namespace App\Enums;

/**
 * Роль участника в пространстве (docs/adr/0005-space-access.md).
 * Системная роль (UserRole) доступа к содержимому пространств не даёт.
 */
enum SpaceRole: string
{
    /** Всё в пространстве: доски, колонки, дорожки, участники и их роли. */
    case Admin = 'admin';

    /** Создаёт, редактирует и перемещает карточки. Структуру и участников не трогает. */
    case Editor = 'editor';

    /** Только чтение (комментарии появятся на этапе 2). */
    case Commenter = 'commenter';

    public function canManageSpace(): bool
    {
        return $this === self::Admin;
    }

    public function canEditCards(): bool
    {
        return $this === self::Admin || $this === self::Editor;
    }
}
