<?php

namespace App\Enums;

/**
 * Причина перехода карточки (card_transitions.reason). Значения не переименовываем — они в истории.
 */
enum TransitionReason: string
{
    /** Создание карточки — первый переход (from = null). */
    case Created = 'created';

    /** Перемещение пользователем (между колонками, дорожками, досками). */
    case Manual = 'manual';

    /** Смена типа колонки, в которой лежит карточка: меняется категория, место — нет. */
    case ColumnTypeChanged = 'column_type_changed';

    /** К колонке добавили первую подколонку — карточки переехали в неё (категория та же). */
    case ColumnSplit = 'column_split';
}
