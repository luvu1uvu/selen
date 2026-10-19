<?php

namespace App\Actions\PmStand;

use App\Actions\Labels\SaveLabelAction;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;

/**
 * Метка с таким названием, доступная в пространстве (своя или общая для компании), — или новая метка
 * пространства. Сравнение без учёта регистра, как у уникального индекса меток.
 */
class EnsureLabelAction
{
    public function __construct(private readonly SaveLabelAction $save) {}

    public function handle(User $actor, Space $space, string $name, string $color): Label
    {
        $existing = Label::query()->availableIn($space)->active()
            ->whereRaw('lower(name) = lower(?)', [$name])
            ->orderByRaw('space_id IS NULL') // своя метка пространства важнее общей
            ->first();

        return $existing ?? $this->save->handle($actor, ['name' => $name, 'color' => $color], space: $space);
    }
}
