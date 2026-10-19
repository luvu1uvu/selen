<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CardTypeResource;
use App\Models\CardType;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Активные типы карточек — для выбора при создании и редактировании карточки. */
class CardTypeController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return CardTypeResource::collection(CardType::query()->active()->ordered()->get());
    }
}
