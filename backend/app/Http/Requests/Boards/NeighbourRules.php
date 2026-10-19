<?php

namespace App\Http\Requests\Boards;

/**
 * Соседи для позиционирования (docs/adr/0007-positions.md): элемент, после которого (after_id)
 * и перед которым (before_id) клиент хочет поставить элемент. Существование не проверяем —
 * устаревший сосед просто игнорируется сервером.
 */
trait NeighbourRules
{
    /**
     * @return array<string, mixed>
     */
    protected function neighbourRules(): array
    {
        return [
            'after_id' => ['nullable', 'ulid'],
            'before_id' => ['nullable', 'ulid'],
        ];
    }
}
