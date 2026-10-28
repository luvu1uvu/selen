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
        // Письмо «Вам открыт доступ» существующему сотруднику и гостю (П2c)
        'login' => '/login',
        'password_reset' => '/reset-password/{token}?email={email}',
        // Подтверждение нового email (смена администратором, П2c-2)
        'email_change' => '/email-change/{token}',
        // Ссылка на файл (/files/{id}): нет такого или нет доступа — одна страница Selen (UI-1b, решение PM 22.10)
        'file_not_found' => '/file-not-found',
    ],

    // Режим копии (ADR-0026): одна команда — одна копия Selen со своим адресом, базой и Владельцем. false (по умолчанию) —
    // «одна компания»: нет экрана «Компании» и гостей (маршруты — 404), вторую компанию не создать. true — «несколько
    // компаний» (ADR-0024): так работают тесты и E2E. Модель компаний, права и изоляция одинаковы в обоих режимах
    'multi_company' => (bool) env('SELEN_MULTI_COMPANY', false),

    'invitations' => [
        // Срок жизни ссылки-приглашения, в часах.
        'ttl_hours' => (int) env('SELEN_INVITATION_TTL_HOURS', 72),
    ],

    // Смена email администратором (LATER-9): срок ссылки подтверждения на новый адрес, в часах — как у приглашения
    'email_change' => [
        'ttl_hours' => 72,
    ],

    // «Последняя активность» в «Пользователях»: время запроса пишется не чаще раза в столько минут (TouchLastSeen)
    'last_seen_interval_minutes' => 5,

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
        // Тот же каталог для PDF, открытых в браузере по ссылке /files/{id} (UI-1b, LATER-51): у этого location nginx
        // своя CSP без sandbox — иначе Chrome не показывает PDF
        'x_accel_pdf_prefix' => '/_protected/attachments-pdf/',
        // Срок жизни временной ссылки на файл в S3, минут
        'temporary_url_minutes' => 5,
    ],

];
