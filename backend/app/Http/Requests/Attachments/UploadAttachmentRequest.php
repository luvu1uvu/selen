<?php

namespace App\Http\Requests\Attachments;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Загрузка вложения: любой тип, до 100 МБ (лимит согласован с nginx и php.ini, ADR-0010). */
class UploadAttachmentRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('comment', $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'max:'.config('selen.attachments.max_kb')],
        ];
    }
}
