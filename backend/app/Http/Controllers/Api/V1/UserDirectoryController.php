<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListUserDirectoryRequest;
use App\Http\Resources\DirectoryUserResource;
use App\Models\Company;
use App\Models\User;
use App\Services\Access\AccessResolver;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Поиск сотрудников компании для добавления в пространство или группу (без деактивированных): её «дома» и Владелец —
 * участник всех компаний, ему можно выдать доступ (ADR-0024); для состава группы (homes) — только «дома». Сотрудники
 * других компаний не попадают в ответ.
 */
class UserDirectoryController extends Controller
{
    public function __invoke(ListUserDirectoryRequest $request, Company $company, AccessResolver $resolver): AnonymousResourceCollection
    {
        $users = User::query()
            ->whereIn('id', $request->boolean('homes') ? $resolver->companyMemberIds($company) : $resolver->companyPeopleIds($company))
            ->where('status', '!=', UserStatus::Deactivated)
            ->when($request->validated('search'), function ($q, $search) {
                $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $q->where(fn ($q) => $q->where('name', 'ilike', $like)->orWhere('email', 'ilike', $like));
            })
            ->orderBy('name')
            ->limit(20)
            ->get();

        return DirectoryUserResource::collection($users);
    }
}
