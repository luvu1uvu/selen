<?php

namespace App\Http\Requests\Cards;

use App\Models\Card;
use App\Models\Label;
use Closure;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

/**
 * Метки карточки целиком. Допустимы общие метки компании и метки пространства карточки;
 * новую метку можно поставить только активную, уже стоящая архивная может остаться.
 */
class SyncCardLabelsRequest extends FormRequest
{
    public const MAX_LABELS = 20;

    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Card $card */
        $card = $this->route('card');
        $current = $card->labels()->pluck('labels.id')->all();

        return [
            'label_ids' => ['present', 'array', 'max:'.self::MAX_LABELS],
            'label_ids.*' => ['ulid', 'distinct', function (string $attribute, mixed $value, Closure $fail) use ($card, $current) {
                $label = Label::query()->availableIn($card->space)->find($value);

                if ($label === null || ($label->isArchived() && ! in_array($label->id, $current, true))) {
                    $fail(__('selen.labels.not_available'));
                }
            }],
        ];
    }
}
