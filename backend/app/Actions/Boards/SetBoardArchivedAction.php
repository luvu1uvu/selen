<?php

namespace App\Actions\Boards;

use App\Enums\EventType;
use App\Models\Board;
use App\Models\User;
use App\Services\EventLog\EventRecorder;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Архивация и восстановление доски. Архивная доска скрыта из навигации и доступна только для чтения;
 * карточки на ней сохраняются как есть.
 */
class SetBoardArchivedAction
{
    public function __construct(private readonly EventRecorder $events) {}

    public function handle(User $actor, Board $board, bool $archived): Board
    {
        return DB::transaction(function () use ($actor, $board, $archived) {
            $board = Board::query()->lockForUpdate()->findOrFail($board->id);

            if ($board->isArchived() === $archived) {
                throw ValidationException::withMessages([
                    'board' => __($archived ? 'selen.boards.already_archived' : 'selen.boards.not_archived'),
                ]);
            }

            $board->forceFill(['archived_at' => $archived ? Date::now() : null])->save();
            $this->events->record($archived ? EventType::BoardArchived : EventType::BoardRestored, $actor, $board);

            return $board;
        });
    }
}
