<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/** Восстановление папки; по желанию — и архивных пространств, лежащих прямо в ней (ADR-0013). */
class RestoreFolderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('update', $this->route('node'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'restore_spaces' => ['sometimes', 'boolean'],
        ];
    }
}
