<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\UserStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ListUserDirectoryRequest;
use App\Http\Resources\DirectoryUserResource;
use App\Models\User;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** Поиск сотрудников для добавления в пространство (без деактивированных). */
class UserDirectoryController extends Controller
{
    public function __invoke(ListUserDirectoryRequest $request): AnonymousResourceCollection
    {
        $users = User::query()
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
