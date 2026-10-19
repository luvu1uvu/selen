<?php

namespace App\Services\Metrics;

use Carbon\CarbonInterface;

/**
 * Времена потока карточки, рассчитанные по card_transitions. Длительности — в секундах.
 */
final readonly class CardFlowTimes
{
    public function __construct(
        public ?CarbonInterface $createdAt,
        public ?CarbonInterface $firstStartedAt,
        public ?CarbonInterface $completedAt,
    ) {}

    /** Lead time = created_at → completed_at. null — карточка не завершена. */
    public function leadTimeSeconds(): ?int
    {
        return self::seconds($this->createdAt, $this->completedAt);
    }

    /** Cycle time = first_started_at → completed_at. null — карточка не завершена. */
    public function cycleTimeSeconds(): ?int
    {
        return self::seconds($this->firstStartedAt, $this->completedAt);
    }

    private static function seconds(?CarbonInterface $from, ?CarbonInterface $to): ?int
    {
        return $from === null || $to === null ? null : (int) round($from->diffInSeconds($to, true));
    }
}
