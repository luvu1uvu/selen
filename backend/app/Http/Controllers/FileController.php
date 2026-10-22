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

    /**
     * Страница входа с возвратом к файлу — для гостя и деактивированного (bootstrap/app.php, EnsureUserIsActive).
     * Адрес возврата — из маршрута, а не из запроса: лишние параметры (utm, ?download=true) не мешают возврату, страница
     * входа принимает только `/files/<id>[?download=1]`. До привязки модели {attachment} — строка из адреса.
     */
    public static function loginUrl(Request $request): string
    {
        $attachment = $request->route('attachment');
        $id = $attachment instanceof Attachment ? $attachment->id : (string) $attachment;
        $file = '/files/'.rawurlencode($id).($request->boolean('download') ? '?download=1' : '');

        return '/login?next='.rawurlencode($file);
    }
}
