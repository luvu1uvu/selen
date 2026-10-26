<?php

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/*
| Данные компании (ADR-0024; CLAUDE.md, правило 11): модель, у таблицы которой есть company_id, использует трейт
| BelongsToCompany (связь company, выборки inCompany()). Новая таблица с данными компании без трейта роняет тест.
| Модели без своей колонки (доски, карточки и всё внутри) — компания через пространство (HasCompany).
*/

it('модели с колонкой company_id используют BelongsToCompany', function () {
    $missing = [];

    foreach (glob(app_path('Models/*.php')) as $file) {
        $class = 'App\\Models\\'.basename($file, '.php');
        if (! is_subclass_of($class, Model::class) || (new ReflectionClass($class))->isAbstract()) {
            continue;
        }

        $table = (new $class)->getTable();
        if (Schema::hasColumn($table, 'company_id') && ! in_array(BelongsToCompany::class, class_uses_recursive($class), true)) {
            $missing[] = $class;
        }
    }

    expect($missing)->toBe([]);
});

it('каждая таблица с company_id — модель с BelongsToCompany или явное исключение', function () {
    // Таблицы без своей модели или где компания — часть ключа, а не данные компании
    $exceptions = ['company_members'];
    $models = collect(glob(app_path('Models/*.php')))
        ->map(fn (string $file) => 'App\\Models\\'.basename($file, '.php'))
        ->filter(fn (string $class) => is_subclass_of($class, Model::class) && in_array(BelongsToCompany::class, class_uses_recursive($class), true))
        ->map(fn (string $class) => (new $class)->getTable());

    $tables = collect(Schema::getTables())->pluck('name')
        ->filter(fn (string $table) => Schema::hasColumn($table, 'company_id'))
        ->reject(fn (string $table) => in_array($table, $exceptions, true));

    expect($tables->diff($models)->values()->all())->toBe([]);
});
