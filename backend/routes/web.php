<?php

use App\Http\Controllers\FileController;
use Illuminate\Support\Facades\Route;

// Интерфейс — SPA (frontend/), данные — /api/v1. Веб-маршрут один: ссылка на файл вложения, которую браузер открывает
// сам — из адресной строки, новой вкладки, мессенджера (UI-1b, LATER-51). Без входа — страница входа и возврат к файлу
// (bootstrap/app.php, redirectGuestsTo). Маршрут /sanctum/csrf-cookie регистрирует Sanctum, /up — health check.
Route::get('files/{attachment}', [FileController::class, 'show'])
    ->middleware(['auth', 'active', 'throttle:files'])
    ->name('files.show');
