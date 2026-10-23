<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

/**
 * Активные группы компании для выдачи доступа к пространству (ADR-0024): администратор компании и администраторы
 * её пространств. Группы других компаний в ответ не попадают.
 */
class GroupDirectoryController extends Controller
{
    public function __invoke(Company $company): JsonResponse
    {
        Gate::authorize('viewDirectory', [Group::class, $company]);

        // Встроенная «Все сотрудники» компании — первой
        $groups = Group::query()->inCompany($company)->active()->withCount('members')->orderByRaw('system_key IS NULL, lower(name)')->get()
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
