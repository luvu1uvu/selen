<?php

namespace App\Enums;

/** Тип узла дерева навигации (ADR-0013). Позже — document. */
enum NavNodeType: string
{
    case Folder = 'folder';
    case Space = 'space';
}
