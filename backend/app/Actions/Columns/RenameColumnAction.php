<?php

namespace App\Actions\Columns;

use App\Enums\EventType;
use App\Models\BoardColumn;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\DB;

/** Переименование колонки. История переходов ссылается на id и не меняется. */
class RenameColumnAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, BoardColumn $column, string $name): BoardColumn
    {
        return DB::transaction(function () use ($actor, $column, $name) {
            if ($column->name === $name) {
                return $column;
            }

            $column->forceFill(['name' => $name])->save();
            $this->events->record(EventType::ColumnRenamed, $actor, $column, ['board_id' => $column->board_id]);

            return $column;
        });
    }
}
