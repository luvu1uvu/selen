<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/** Активные группы для выдачи доступа к пространству: системный администратор и администраторы пространств. */
class GroupDirectoryController extends Controller
{
    public function __invoke(): JsonResponse
    {
        Gate::authorize('viewDirectory', Group::class);

        // Встроенная «Все сотрудники» — первой
        $groups = Group::query()->active()->withCount('members')->orderByRaw('system_key IS NULL, lower(name)')->get()
            ->map(fn (Group $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'description' => $group->description,
                'system' => $group->system_key,
                'members_count' => $group->membersCount(),
            ]);

        return response()->json(['data' => $groups]);
    }
}
