<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Attachments\RemoveAttachmentAction;
use App\Actions\Attachments\UploadAttachmentAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attachments\UploadAttachmentRequest;
use App\Http\Resources\AttachmentResource;
use App\Http\Resources\CardResource;
use App\Models\Attachment;
use App\Models\Card;
use App\Services\Attachments\AttachmentFiles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Вложения карточки (docs/adr/0010-attachments.md). Скачивание — только через приложение с проверкой
 * доступа к карточке; сам файл отдаёт nginx (X-Accel-Redirect) или S3 (временная ссылка).
 */
class AttachmentController extends Controller
{
    public function store(UploadAttachmentRequest $request, Card $card, UploadAttachmentAction $action): JsonResponse
    {
        $attachment = $action->handle($request->user(), $card, $request->file('file'));

        return (new AttachmentResource($attachment->load(['uploader', 'card'])))->response()->setStatusCode(201);
    }

    /** ?inline=1 — показать в браузере (только картинки и видео из белого списка), иначе — скачать. */
    public function show(Request $request, Attachment $attachment, AttachmentFiles $files): Response
    {
        Gate::authorize('view', $attachment);

        return $files->response($attachment, $request->boolean('inline'));
    }

    public function destroy(Request $request, Attachment $attachment, RemoveAttachmentAction $action): CardResource
    {
        Gate::authorize('delete', $attachment);
        $action->handle($request->user(), $attachment);

        return new CardResource($attachment->card->loadDetails());
    }
}
