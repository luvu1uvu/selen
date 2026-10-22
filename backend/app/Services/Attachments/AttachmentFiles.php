<?php

namespace App\Services\Attachments;

use App\Models\Attachment;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Normalizer;
use Symfony\Component\HttpFoundation\HeaderUtils;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * Файлы вложений: сохранение и безопасная отдача (docs/adr/0010-attachments.md).
 *
 * - Тип определяется по содержимому (finfo), не по расширению и не по заголовку браузера.
 * - Встроенно (inline) отдаются только картинки и видео из белого списка; по ссылке на файл (/files/{id}) — ещё
 *   и PDF (по содержимому). Всё остальное, включая SVG, HTML и XML, — только скачиванием и как application/octet-stream.
 * - Локальный диск: файл отдаёт nginx по X-Accel-Redirect (Range-запросы, перемотка видео);
 *   S3: короткая временная ссылка. Доступ к карточке проверяется до вызова.
 */
class AttachmentFiles
{
    /** Типы, которые можно показывать в браузере: картинки — превью, видео — встроенный плеер. */
    public const INLINE_TYPES = [
        'image/png' => 'image',
        'image/jpeg' => 'image',
        'image/gif' => 'image',
        'image/webp' => 'image',
        'video/mp4' => 'video',
        'video/webm' => 'video',
        // Запись экрана на macOS (.mov). Браузер может не знать кодек (например, HEVC) — тогда клиент
        // показывает сообщение и кнопку «Скачать» вместо плеера
        'video/quicktime' => 'video',
    ];

    /** PDF по содержимому (finfo при загрузке) — по ссылке на файл открывается в браузере (UI-1b, решение PM 21.10). */
    public const PDF = 'application/pdf';

    /** CSP для PDF, открытого в браузере: без sandbox (с ним Chrome PDF не показывает), встроенный просмотрщик — object-src. */
    public const PDF_CSP = "default-src 'none'; object-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

    /**
     * Сохранить загруженный файл на диск вложений. Возвращает атрибуты для модели Attachment.
     *
     * @return array{disk: string, path: string, name: string, mime: string, size: int, kind: string}
     */
    public function store(UploadedFile $file, string $cardId): array
    {
        $disk = (string) config('selen.attachments.disk');
        $mime = $file->getMimeType() ?? 'application/octet-stream';
        $path = $cardId.'/'.Str::ulid()->toBase32();

        Storage::disk($disk)->putFileAs($cardId, $file, basename($path));

        return [
            'disk' => $disk,
            'path' => $path,
            'name' => self::sanitizeName($file->getClientOriginalName()),
            'mime' => $mime,
            'size' => (int) $file->getSize(),
            'kind' => self::INLINE_TYPES[$mime] ?? 'file',
        ];
    }

    /**
     * Имя файла для показа и заголовка Content-Disposition: без путей и управляющих символов,
     * в NFC, не длиннее 255 байт (расширение сохраняется).
     */
    public static function sanitizeName(string $name): string
    {
        $name = Normalizer::normalize($name, Normalizer::FORM_C) ?: $name;
        // Последний компонент пути — и для «/», и для «\»
        $name = (string) preg_replace('~^.*[/\\\\]~u', '', $name);
        $name = (string) preg_replace('/[\p{Cc}\p{Cf}"]+/u', '', $name);
        $name = trim($name, " .\t");

        if ($name === '') {
            return 'file';
        }

        if (strlen($name) <= 255) {
            return $name;
        }

        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $suffix = $extension !== '' && strlen($extension) <= 16 ? '.'.$extension : '';

        return mb_strcut($name, 0, 255 - strlen($suffix), 'UTF-8').$suffix;
    }

    /** Имя для старых клиентов (filename=): только печатный ASCII без символов, запрещённых в заголовке. */
    private static function asciiFallback(string $name): string
    {
        $ascii = (string) preg_replace('/[^\x20-\x7e]|[%\/\\\\"]/', '_', Str::ascii($name));

        return trim($ascii) === '' ? 'file' : $ascii;
    }

    /** Ответ с файлом для приложения (/api/v1/attachments/{id}). inline — по желанию клиента, только для белого списка. */
    public function response(Attachment $attachment, bool $inline): Response
    {
        return $this->respond($attachment, $inline && isset(self::INLINE_TYPES[$attachment->mime]), false);
    }

    /**
     * Ответ по ссылке на файл (/files/{id}, UI-1b, LATER-51): картинки и видео из белого списка и PDF (тип — по
     * содержимому, не по имени) — в браузере, остальное — скачиванием; $download — всегда скачать.
     */
    public function linkResponse(Attachment $attachment, bool $download): Response
    {
        $pdf = $attachment->mime === self::PDF;
        $inline = ! $download && ($pdf || isset(self::INLINE_TYPES[$attachment->mime]));

        return $this->respond($attachment, $inline, $inline && $pdf);
    }

    private function respond(Attachment $attachment, bool $inline, bool $pdf): Response
    {
        $disposition = HeaderUtils::makeDisposition(
            $inline ? HeaderUtils::DISPOSITION_INLINE : HeaderUtils::DISPOSITION_ATTACHMENT,
            $attachment->name,
            self::asciiFallback($attachment->name),
        );
        $type = $inline ? $attachment->mime : 'application/octet-stream';
        $disk = Storage::disk($attachment->disk);

        if (config("filesystems.disks.{$attachment->disk}.driver") === 's3') {
            /** @var FilesystemAdapter $disk */
            $url = $disk->temporaryUrl($attachment->path, now()->addMinutes((int) config('selen.attachments.temporary_url_minutes')), [
                'ResponseContentType' => $type,
                'ResponseContentDisposition' => $disposition,
            ]);

            return new RedirectResponse($url, 302, ['Cache-Control' => 'private, no-store']);
        }

        // Тело пустое: файл отдаёт nginx из internal-location (Range-запросы — его забота)
        // Защитные заголовки у отданного файла ставит location nginx (у PDF — свой, PDF_CSP); здесь — те же для ясности
        return new Response('', 200, [
            'Content-Type' => $type,
            'Content-Disposition' => $disposition,
            'X-Accel-Redirect' => config($pdf ? 'selen.attachments.x_accel_pdf_prefix' : 'selen.attachments.x_accel_prefix')
                .$attachment->path,
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => $pdf ? self::PDF_CSP : "default-src 'none'; sandbox",
            // Браузер переспрашивает сервер при каждом открытии — права проверяются каждый раз (выход, потеря доступа,
            // корзина), а неизменённый файл nginx не передаёт заново: 304 по ETag/Last-Modified (UI-1b). Этот заголовок
            // nginx передаёт как есть — в location его не задаём
            'Cache-Control' => 'private, no-cache',
        ]);
    }
}
