<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Services\Attachments\AttachmentFiles;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Ссылка на файл вложения, открытая напрямую — из адресной строки, новой вкладки, мессенджера (UI-1b, LATER-51,
 * docs/adr/0010-attachments.md). Веб-маршрут на сессии: без Referer/Origin Sanctum запрос к /api/v1 «своим» не считает.
 * Права — при каждом открытии, как у файла в приложении (AttachmentPolicy → CardVisibility): нет доступа, карточка
 * в корзине, вложение удалено — 404.
 */
class FileController extends Controller
{
    /** ?download=1 — всегда скачать (кнопка «Скачать»); иначе картинки, видео и PDF — в браузере. */
    public function show(Request $request, Attachment $attachment, AttachmentFiles $files): Response
    {
        Gate::authorize('view', $attachment);

        return $files->linkResponse($attachment, $request->boolean('download'));
    }
}
