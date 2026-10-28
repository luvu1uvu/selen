<?php

use App\Enums\EventType;

/*
| Каталог типов событий описан в трёх местах (CLAUDE.md, правило 6): App\Enums\EventType,
| frontend/src/features/admin/eventTypes.ts и перевод admin.json → events.types.
| Тест не даёт им разойтись. Frontend лежит рядом в том же репозитории (и в CI тоже).
*/

const FRONTEND_SRC = __DIR__.'/../../../../frontend/src';

it('каталог типов событий совпадает на backend и frontend, у каждого типа есть перевод', function () {
    $frontend = FRONTEND_SRC;
    // Только массив EVENT_TYPES: ниже в файле — подмножества каталога (события только нескольких компаний, ADR-0026)
    preg_match('/EVENT_TYPES = \[(.*?)\] as const/s', (string) file_get_contents("{$frontend}/features/admin/eventTypes.ts"), $catalog);
    preg_match_all("/^\s+'([a-z_]+\.[a-z_]+)',$/m", $catalog[1] ?? '', $matches);

    $backendTypes = array_map(fn (EventType $type) => $type->value, EventType::cases());
    expect($matches[1])->toBe($backendTypes);

    $translations = json_decode((string) file_get_contents("{$frontend}/shared/i18n/locales/ru/admin.json"), true);
    foreach ($backendTypes as $type) {
        expect($translations['events']['types'])->toHaveKey(preg_replace('/\./', '_', $type, 1));
    }
})->skip(! is_dir(FRONTEND_SRC), 'frontend недоступен в этом окружении');
