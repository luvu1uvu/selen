<?php

namespace App\Actions\PmStand;

use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\SyncCardLabelsAction;
use App\Actions\Cards\UpdateCardAction;
use App\Models\Label;
use App\Models\Space;
use App\Models\User;
use App\Services\PmStand\PmStand;
use App\Support\RichText\RichTextBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Карточки доски «Бэклог» из docs/pm/deferred.yaml. Сверка по названию среди всех карточек доски, включая
 * архивные: существующую карточку не трогаем (PM мог её перенести, дописать или убрать в архив).
 */
class ImportDeferredAction
{
    public function __construct(
        private readonly CreateCardAction $createCard,
        private readonly UpdateCardAction $updateCard,
        private readonly SyncCardLabelsAction $syncLabels,
    ) {}

    /**
     * @param  list<array{title: string, column: string, labels?: list<string>, description: string}>  $items
     * @return array{created: list<string>, skipped: list<string>}
     */
    public function handle(User $owner, Space $space, array $items): array
    {
        return DB::transaction(function () use ($owner, $space, $items) {
            $board = PmStand::requireBoard($space, PmStand::BACKLOG_BOARD);
            $lane = PmStand::lane($board);
            // Удалённые в корзину тоже считаются заведёнными: иначе удалённая карточка вернулась бы при pm-update
            $existing = $board->cards()->withTrashed()->pluck('title')->map(fn (string $title) => mb_strtolower($title))->all();
            $labels = Label::query()->availableIn($space)->active()->get()
                ->keyBy(fn (Label $label) => mb_strtolower($label->name));
            $result = ['created' => [], 'skipped' => []];

            foreach ($items as $item) {
                if (in_array(mb_strtolower($item['title']), $existing, true)) {
                    $result['skipped'][] = $item['title'];

                    continue;
                }

                $column = PmStand::requireColumn($board, $item['column']);
                $card = $this->createCard->handle($owner, $board, ['title' => $item['title']], $column, $lane);
                $this->updateCard->handle($owner, $card, [
                    'description' => RichTextBuilder::doc(RichTextBuilder::paragraphs($item['description'])),
                ]);

                $labelIds = collect($item['labels'] ?? [])
                    ->map(fn (string $name) => $labels->get(mb_strtolower($name))?->id)
                    ->filter()->values()->all();
                if ($labelIds !== []) {
                    $this->syncLabels->handle($owner, $card, $labelIds);
                }

                $result['created'][] = $card->key().' '.$item['title'];
            }

            return $result;
        });
    }
}
