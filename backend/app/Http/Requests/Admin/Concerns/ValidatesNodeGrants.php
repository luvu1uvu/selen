<?php

namespace App\Http\Requests\Admin\Concerns;

use App\Actions\Access\GrantableNodes;
use App\Enums\StandardRole;
use App\Http\Requests\Concerns\ValidatesRoles;
use App\Models\Company;
use App\Models\NavNode;
use App\Models\Role;
use App\Models\User;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Доступ к папкам и пространствам в приглашении и у гостя (П2c; папки и несколько ролей — П2d-1): grants —
 * [{node_id, roles}]. Узел — этой компании, не в архиве, и автор может выдавать в нём доступ (GrantableNodes); иначе —
 * 422 «не найдено», как несуществующий (узел другой компании неотличим). Гостю — только пространства и роли без
 * «управления доступом».
 */
trait ValidatesNodeGrants
{
    use ValidatesRoles;

    /**
     * @param  list<StandardRole>  $roles  какие роли можно выдать
     * @return array<string, mixed>
     */
    protected function nodeGrantRules(array $roles): array
    {
        return [
            'grants' => ['sometimes', 'array', 'max:50'],
            'grants.*' => ['array:node_id,roles'],
            'grants.*.node_id' => ['required', 'string', 'distinct'],
            'grants.*.roles' => ['required', 'array', 'min:1', 'max:'.count(StandardRole::cases())],
            'grants.*.roles.*' => ['required', 'string', 'distinct', Rule::in(array_map(fn (StandardRole $role) => $role->value, $roles))],
        ];
    }

    protected function validateNodeGrants(Validator $validator, bool $spacesOnly = false): void
    {
        /** @var Company $company */
        $company = $this->route('company');
        /** @var User $actor */
        $actor = $this->user();
        $grantable = app(GrantableNodes::class);

        foreach ((array) $this->input('grants', []) as $index => $grant) {
            $id = is_array($grant) ? ($grant['node_id'] ?? null) : null;
            $node = is_string($id) ? NavNode::query()->inCompany($company)->with('space')->find($id) : null;
            if ($node === null || ($spacesOnly && $node->isFolder()) || ! $grantable->allows($actor, $node, $company)) {
                $validator->errors()->add("grants.{$index}.node_id", __($spacesOnly ? 'selen.spaces.not_found' : 'selen.access.node_not_found'));
            }
        }
    }

    /**
     * Выдачи из запроса: узлы и роли (после валидации).
     *
     * @return list<array{node: NavNode, roles: list<Role>}>
     */
    public function nodeGrants(): array
    {
        /** @var Company $company */
        $company = $this->route('company');
        $grants = [];
        foreach ((array) $this->validated('grants', []) as $grant) {
            $grants[] = [
                'node' => NavNode::query()->inCompany($company)->findOrFail($grant['node_id']),
                'roles' => self::rolesOf($grant['roles']),
            ];
        }

        return $grants;
    }
}
