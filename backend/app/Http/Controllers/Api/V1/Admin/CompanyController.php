<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Actions\Companies\CreateCompanyAction;
use App\Actions\Companies\RenameCompanyAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveCompanyRequest;
use App\Http\Resources\CompanyResource;
use App\Models\Company;
use App\Services\Access\AccessResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

/**
 * Экран Владельца «Компании» (ADR-0024): список, создание из шаблона, переименование. Администраторов компании
 * Владелец назначает в её «Пользователях» (admin/companies/{company}/users/{user}/role).
 */
class CompanyController extends Controller
{
    public function index(AccessResolver $resolver): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Company::class);

        $companies = Company::query()->orderBy('created_at')->orderBy('id')->get();

        return CompanyResource::collection($this->withSummary($companies, $resolver));
    }

    public function store(SaveCompanyRequest $request, CreateCompanyAction $action): JsonResponse
    {
        $company = $action->handle($request->user(), $request->string('name')->trim()->toString());

        return (new CompanyResource($company))->response()->setStatusCode(201);
    }

    public function update(SaveCompanyRequest $request, Company $company, RenameCompanyAction $action, AccessResolver $resolver): CompanyResource
    {
        $company = $action->handle($request->user(), $company, $request->string('name')->trim()->toString());

        return new CompanyResource($this->withSummary(new Collection([$company]), $resolver)->first());
    }

    /**
     * @param  Collection<int, Company>  $companies
     * @return Collection<int, Company>
     */
    private function withSummary(Collection $companies, AccessResolver $resolver): Collection
    {
        $summary = $resolver->companiesSummary();

        return $companies->each(fn (Company $company) => $company->setAttribute('people_count', $summary['people']->get($company->id, 0))
            ->setAttribute('admins', $summary['admins']->get($company->id, collect())));
    }
}
