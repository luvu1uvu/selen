<?php

use App\Enums\SpaceRole;

/*
| Админка → пользователь: сводка «к каким пространствам доступ и почему» (ADR-0012) и последствия деактивации
| (решение PM этапа 3: деактивация не блокируется, но предупреждает о пространствах без администратора).
*/

beforeEach(function () {
    $this->admin = admin();
});

it('сводка показывает источники, в том числе недействующие, с причиной', function () {
    $olga = member(['name' => 'Ольга']);
    $backend = space(['key' => 'BACK', 'name' => 'Backend']);
    $ios = space(['key' => 'IOS', 'name' => 'iOS']);
    $mgmt = space(['key' => 'MGMT', 'name' => 'Management']);
    addToSpace($backend, $olga, SpaceRole::Editor);
    $analysts = addToGroup(makeGroup(['name' => 'Analysts']), $olga);
    grantGroup($backend, $analysts, SpaceRole::Commenter);
    grantGroup($ios, $analysts, SpaceRole::Commenter);
    $old = addToGroup(makeGroup(['name' => 'Old', 'archived_at' => now()]), $olga);
    grantGroup($mgmt, $old, SpaceRole::Admin);

    $data = $this->actingAs($this->admin)->getJson(adminPath()."users/{$olga->id}/access")->assertOk()->json('data');

    expect(collect($data['groups'])->pluck('name')->all())->toBe(['Все сотрудники', 'Analysts', 'Old'])
        ->and(collect($data['spaces'])->pluck('space.key')->all())->toBe(['BACK', 'IOS', 'MGMT']);

    [$back, $iosEntry, $mgmtEntry] = $data['spaces'];
    expect($back['has_access'])->toBeTrue()
        ->and($back['role'])->toBe('editor')
        ->and($back['sources'])->toBe([
            ['type' => 'personal', 'group' => null, 'folder' => null, 'roles' => ['editor'], 'inactive_reason' => null],
            ['type' => 'group', 'group' => ['id' => $analysts->id, 'name' => 'Analysts'], 'folder' => null, 'roles' => ['commenter'], 'inactive_reason' => null],
        ])
        ->and($iosEntry['role'])->toBe('commenter')
        ->and($mgmtEntry['has_access'])->toBeFalse()
        ->and($mgmtEntry['sources'][0]['inactive_reason'])->toBe('group_archived');
});

it('у деактивированного групповые источники не действуют', function () {
    $gone = member(['status' => 'deactivated']);
    addToSpaceViaGroup(space(), $gone, SpaceRole::Editor);

    $this->actingAs($this->admin)->getJson(adminPath()."users/{$gone->id}/access")
        ->assertJsonPath('data.spaces.0.has_access', false)
        ->assertJsonPath('data.spaces.0.sources.0.inactive_reason', 'user_deactivated');
});

it('доступна только администратору компании', function () {
    $user = member();
    $this->actingAs(member())->getJson(adminPath()."users/{$user->id}/access")->assertForbidden();
    $this->actingAs(member())->getJson(adminPath()."users/{$user->id}/deactivation-impact")->assertForbidden();
});

describe('деактивация последнего личного администратора', function () {
    it('не блокируется, но заранее показывает пространства, которые останутся без администратора', function () {
        $anna = member(['name' => 'Анна', 'status' => 'active']);
        $dev = space(['key' => 'DEV', 'name' => 'Dev']);
        $ops = space(['key' => 'OPS', 'name' => 'Ops']);
        $mkt = space(['key' => 'MKT', 'name' => 'Marketing']);
        addToSpace($dev, $anna, SpaceRole::Admin);
        addToSpace($ops, $anna, SpaceRole::Admin);
        addToSpace($ops, member(), SpaceRole::Admin);
        addToSpace($mkt, $anna, SpaceRole::Editor);
        addToSpace($mkt, member(), SpaceRole::Admin);
        // Администратор через группу не считается: инвариант — про личных
        addToSpaceViaGroup($dev, member(), SpaceRole::Admin);
        // Деактивированный второй администратор тоже не считается
        addToSpace($dev, member(['status' => 'deactivated']), SpaceRole::Admin);

        $this->actingAs($this->admin)->getJson(adminPath()."users/{$anna->id}/deactivation-impact")
            ->assertOk()
            ->assertJsonPath('data.last_admin_spaces.*.key', ['DEV']);

        $this->postJson(adminPath()."users/{$anna->id}/deactivate")->assertOk();

        // В админке «Пространства» — без администратора первыми
        $this->getJson(adminPath().'spaces')
            ->assertJsonPath('data.0.key', 'DEV')
            ->assertJsonPath('data.0.has_active_admin', false)
            ->assertJsonPath('data.1.has_active_admin', true);
    });

    it('назначенная замена снимает предупреждение', function () {
        $anna = member(['status' => 'active']);
        $dev = space(['key' => 'DEV']);
        addToSpace($dev, $anna, SpaceRole::Admin);
        $this->actingAs($this->admin);

        $this->putJson(adminPath().'nav-nodes/'.nodeOf($dev)->id.'/access/users/'.member()->id, ['roles' => ['admin']])->assertOk();

        $this->getJson(adminPath()."users/{$anna->id}/deactivation-impact")->assertJsonPath('data.last_admin_spaces', []);
    });
});
