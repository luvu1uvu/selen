<?php

namespace App\Actions\PmStand;

use App\Actions\Attachments\UploadAttachmentAction;
use App\Actions\Cards\CreateCardAction;
use App\Actions\Cards\SyncCardLabelsAction;
use App\Actions\Cards\UpdateCardAction;
use App\Models\Card;
use App\Models\CardType;
use App\Models\Label;
use App\Models\User;
use App\Services\PmStand\PmStand;
use App\Support\RichText\RichTextBuilder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Карточка-баг на доске «Баги приёмки» (колонка «Новый») от имени QA-бота: тип «Баг», описание по шаблону
 * (тест-кейс, шаги, ожидаемый и фактический результат), метки, скриншот — вложением и картинкой в описании.
 * Метку подэтапа, если её ещё нет, заводит PM: создавать метки пространства боту не положено. Метки из `labels`
 * (например, «безопасность», ADR-0020) — только существующие: какой нет, ту карточка не получает, а команда
 * предупреждает.
 */
class ReportBugAction
{
    public function __construct(
        private readonly CreateCardAction $createCard,
        private readonly UpdateCardAction $updateCard,
        private readonly SyncCardLabelsAction $syncLabels,
        private readonly UploadAttachmentAction $upload,
        private readonly EnsureLabelAction $ensureLabel,
    ) {}

    /**
     * @param  array{title: string, test_case: string, steps: string|list<string>, expected: string, actual: string, substage?: string|null, labels?: list<string>}  $bug
     * @return array{card: Card, missing_labels: list<string>}
     */
    public function handle(User $bot, User $owner, array $bug, ?UploadedFile $screenshot = null): array
    {
        $space = PmStand::requireSpace();
        $board = PmStand::requireBoard($space, PmStand::BUGS_BOARD);
        $column = PmStand::requireColumn($board, array_key_first(PmStand::BUGS_COLUMNS));
        $type = CardType::query()->inCompany($space->company_id)->active()->where('name', PmStand::BUG_TYPE)->firstOrFail();

        return DB::transaction(function () use ($bot, $owner, $bug, $screenshot, $space, $board, $column, $type) {
            $card = $this->createCard->handle($bot, $board, [
                'title' => $bug['title'],
                'card_type_id' => $type->id,
            ], $column, PmStand::lane($board));

            $image = $screenshot !== null ? $this->upload->handle($bot, $card, $screenshot) : null;

            $steps = is_array($bug['steps']) ? $bug['steps'] : RichTextBuilder::lines($bug['steps']);
            $actual = RichTextBuilder::paragraphs($bug['actual']);
            if ($image !== null && $image->kind === 'image') {
                $actual[] = RichTextBuilder::image($image->id, $image->name);
            }

            $this->updateCard->handle($bot, $card, ['description' => RichTextBuilder::doc([
                RichTextBuilder::heading('Тест-кейс'),
                ...RichTextBuilder::paragraphs($bug['test_case']),
                RichTextBuilder::heading('Шаги воспроизведения'),
                RichTextBuilder::orderedList($steps),
                RichTextBuilder::heading('Ожидаемый результат'),
                ...RichTextBuilder::paragraphs($bug['expected']),
                RichTextBuilder::heading('Фактический результат'),
                ...$actual,
            ])]);

            $labelIds = [];
            if (($bug['substage'] ?? null) !== null) {
                $labelIds[] = $this->ensureLabel->handle($owner, $space, $bug['substage'], PmStand::SUBSTAGE_LABEL_COLOR)->id;
            }
            // Своя метка пространства важнее общей с тем же названием (как в EnsureLabelAction): keyBy оставляет последнюю
            $existing = Label::query()->availableIn($space)->active()->orderByRaw('space_id IS NOT NULL')->get()
                ->keyBy(fn (Label $label) => mb_strtolower($label->name));
            $missing = [];
            foreach ($bug['labels'] ?? [] as $name) {
                $label = $existing->get(mb_strtolower($name));
                if ($label === null) {
                    $missing[] = $name;
                } else {
                    $labelIds[] = $label->id;
                }
            }
            if ($labelIds !== []) {
                $this->syncLabels->handle($bot, $card, array_values(array_unique($labelIds)));
            }

            return ['card' => $card, 'missing_labels' => $missing];
        });
    }
}
