<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Navigation\NavigationTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Дерево навигации пользователя (сайдбар): только папки с доступными ему пространствами (ADR-0013). */
class NavigationController extends Controller
{
    public function __invoke(Request $request, NavigationTree $tree): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $tree->forUser($user)]);
    }
}
