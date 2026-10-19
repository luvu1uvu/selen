<?php

/*
|--------------------------------------------------------------------------
| Настройки Selen
|--------------------------------------------------------------------------
| Бизнес-параметры приложения. Значения берутся из .env (см. .env.example).
*/

return [

    // Адрес SPA: из него строятся ссылки в письмах.
    'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost:8080')), '/'),

    // Пути SPA, на которые ведут ссылки из писем. Должны совпадать с frontend/src/app/routes.tsx.
    'frontend_paths' => [
        'invitation' => '/invitations/{token}',
        'password_reset' => '/reset-password/{token}?email={email}',
    ],

    'invitations' => [
        // Срок жизни ссылки-приглашения, в часах.
        'ttl_hours' => (int) env('SELEN_INVITATION_TTL_HOURS', 72),
    ],

    'auth_audit' => [
        // Срок хранения IP и user agent событий входа (таблица auth_audit), в месяцах.
        'retention_months' => 12,
    ],

    // Часовой пояс нового пользователя по умолчанию (в БД всё хранится в UTC).
    'default_timezone' => 'Europe/Moscow',

    // Минимальная длина пароля. Должна совпадать с PASSWORD_MIN_LENGTH на frontend.
    'password_min_length' => 10,

    // Вложения карточек (docs/adr/0010-attachments.md)
    'attachments' => [
        // attachments — локальный диск (по умолчанию), s3 — S3-совместимое хранилище
        'disk' => env('ATTACHMENTS_DISK', 'attachments'),
        // Лимит размера файла, КБ (100 МБ). Согласован с nginx (client_max_body_size) и php.ini
        'max_kb' => 102400,
        // Префикс internal-location nginx для отдачи локальных файлов (X-Accel-Redirect)
        'x_accel_prefix' => '/_protected/attachments/',
        // Срок жизни временной ссылки на файл в S3, минут
        'temporary_url_minutes' => 5,
    ],

];
